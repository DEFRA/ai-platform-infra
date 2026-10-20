import { capacityPolicyFor, needsCapacity, skusForTier } from './catalogue.js'
import { isCanonical } from './canonical-json.js'

const MAX_FILE_BYTES = 60 * 1024
const MAX_CLIENTS = 40
const TEAM_PATH = /^environments\/([a-z][a-z0-9]{1,15})\/([^/]+)\.json$/
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const GRANTABLE = new Set(['available', 'eligible'])
const GLOBAL_SKU = /^Global/
// The one file that may name subscription-key: an engineer's, not a team's.
const RESEARCH_SLUG = 'research'
const SUBSCRIPTION_KEY = 'subscription-key'
// Every team's dedicated deployments share the environment's Foundry account
// in a region, and Azure allows 32 model deployments per Foundry resource
// (Microsoft Learn, Foundry Models quotas and limits, checked 14 Oct 2026).
const MAX_DEPLOYMENTS_PER_ACCOUNT = 32
// Entra counts every object a principal without an Entra role creates,
// soft-deleted ones included, up to 250 (Microsoft Learn, Microsoft Entra
// service limits, checked 14 Oct 2026). The deploy identity creates the
// platform's API audience registration and its service principal, and the
// same pair for each team, every team being an OAuth team.
const DEFAULT_CREATED_OBJECT_LIMIT = 250
const PLATFORM_ENTRA_OBJECTS = 2
const ENTRA_OBJECTS_PER_TEAM = 2

function problem(file, message) {
  return { file, message }
}

/**
 * The catalogue tier a file's deployments belong to: its credential type
 * decides it, since subscription keys are the Research tier's alone.
 *
 * @param {object} document - A team file.
 * @returns {'research' | 'team'} The tier.
 */
function tierOf(document) {
  return document.gateway.credentialType === SUBSCRIPTION_KEY
    ? 'research'
    : 'team'
}

/**
 * What the gateway allows by: a deployment's catalogue slug in a team file,
 * its Azure name in the research file, where nothing translates it.
 *
 * @param {object} document - A team file.
 * @param {{slug: string, deploymentName?: string}} deployment - One entry.
 * @returns {string} The allowed-deployments key.
 */
function grantKey(document, deployment) {
  return tierOf(document) === 'research'
    ? deployment.deploymentName
    : deployment.slug
}

// entra.teamRegistrations false skips only the per-team app registration.
function teamRegistrations(entry) {
  return entry.entra.enabled && entry.entra.teamRegistrations !== false
}

function parseTeamPath(path) {
  const match = TEAM_PATH.exec(path)

  return match ? { environment: match[1], slug: match[2] } : null
}

/**
 * What a federation trusts: a CDP service, or an issuer and subject.
 *
 * @param {object} federation - One of a team file's oauth.federations.
 * @returns {string} A key two federations share when they trust the same
 *   workload.
 */
function federationKey(federation) {
  return federation.host === 'cdp'
    ? `CDP service ${federation.service}`
    : `${federation.issuer} ${federation.subject}`
}

function regionFor(sku, params) {
  return (sku.regions ?? []).find((region) =>
    params.azure.foundry.regions.includes(region)
  )
}

// A research deployment's name is the research API's public contract, so it
// must be exactly the catalogue's deploymentName, which the backend and the
// portal's samples read: a drift is a broken endpoint for every caller.
function checkDeploymentName(path, label, deployment, model) {
  if (!model.deploymentName) {
    return [problem(path, `${label} has no deploymentName in the catalogue`)]
  }

  if (deployment.deploymentName !== model.deploymentName) {
    return [
      problem(
        path,
        `${label} deploymentName ${deployment.deploymentName} must be ` +
          `${model.deploymentName}, the catalogue's`
      )
    ]
  }

  return []
}

function checkDeployments(path, document, previous, context) {
  const { models, params } = context
  const environment = document.environment
  const tier = tierOf(document)
  const problems = []
  const seen = new Set()
  const previousSlugs = new Set(
    (previous?.deployments ?? []).map((deployment) => deployment.slug)
  )

  for (const deployment of document.deployments) {
    const label = `deployment ${deployment.slug}`

    if (seen.has(deployment.slug)) {
      problems.push(problem(path, `${label} is listed twice`))
    }

    seen.add(deployment.slug)
    const model = models.get(deployment.slug)

    if (!model) {
      problems.push(problem(path, `${label} is not in the catalogue`))
      continue
    }

    if (!model.tiers.includes(tier) || !model.eligibility.eligible) {
      problems.push(
        problem(
          path,
          `${label} is not eligible for ${tier === 'research' ? 'the research tier' : 'teams'}`
        )
      )
    }

    if (!model.environments.includes(environment)) {
      problems.push(problem(path, `${label} is not offered in ${environment}`))
    }

    // A deprecated model keeps the grants it has; any other status that is
    // not grantable refuses every deployment of it, old or new.
    const status = model.lifecycle.status
    const kept = status === 'deprecated' && previousSlugs.has(deployment.slug)
    if (!GRANTABLE.has(status) && !kept) {
      const rule = status === 'deprecated' ? 'no new grants' : 'no grants'
      problems.push(problem(path, `${label} is ${status}: ${rule}`))
    }

    const sku = skusForTier(model, tier).find(
      (candidate) => candidate.name === deployment.sku
    )

    if (!sku) {
      problems.push(problem(path, `${label} sku ${deployment.sku} not allowed`))
    } else if (tier === 'research' && GLOBAL_SKU.test(sku.name)) {
      problems.push(
        problem(
          path,
          `${label} sku ${sku.name} is a Global type, excluded by D03`
        )
      )
    } else if (!regionFor(sku, params)) {
      problems.push(
        problem(path, `${label} has no Foundry region in ${environment}`)
      )
    }

    if (tier === 'research') {
      problems.push(...checkDeploymentName(path, label, deployment, model))
    }

    // Capacity is the hosting platform's word: Foundry sizes a deployment by
    // it; a platform that does not takes none.
    if (needsCapacity(model) && deployment.capacity === undefined) {
      problems.push(
        problem(path, `${label} needs capacity on ${model.hosting.platform}`)
      )
    } else if (!needsCapacity(model) && deployment.capacity !== undefined) {
      problems.push(
        problem(
          path,
          `${label} takes no capacity on ${model.hosting?.platform ?? 'its hosting'}`
        )
      )
    }

    const policy = capacityPolicyFor(model, environment)
    if (
      deployment.capacity !== undefined &&
      (deployment.capacity < policy.min || deployment.capacity > policy.max)
    ) {
      problems.push(
        problem(
          path,
          `${label} capacity ${deployment.capacity} is outside ` +
            `${policy.min} to ${policy.max}`
        )
      )
    }
  }

  return problems
}

function checkGateway(path, document) {
  const problems = []
  const research = tierOf(document) === 'research'
  const dedicated = new Set(
    document.deployments.map((deployment) => grantKey(document, deployment))
  )
  const allowed = new Set(document.gateway.allowedDeployments)

  for (const entry of allowed) {
    if (!dedicated.has(entry)) {
      problems.push(
        problem(
          path,
          research
            ? `allowedDeployments ${entry} is not a deployment in this file`
            : `allowedDeployments ${entry} is not a dedicated deployment of ` +
                'this team; shared Research grants are not built yet'
        )
      )
    }
  }

  // Nothing translates a research name, so one that is deployed but not
  // allowed is a deployment no caller can reach.
  for (const name of research ? dedicated : []) {
    if (!allowed.has(name)) {
      problems.push(
        problem(path, `deployment ${name} is not in allowedDeployments`)
      )
    }
  }

  if (document.deployments.length > 0) {
    const ceiling = document.deployments.reduce(
      (sum, deployment) => sum + deployment.capacity * 1000,
      0
    )

    if (document.gateway.limits.tokensPerMinute > ceiling) {
      problems.push(
        problem(
          path,
          `tokensPerMinute exceeds the team's capacity of ${ceiling}`
        )
      )
    }
  }

  return problems
}

// A CDP federation names only its service: Terraform derives the issuer,
// subject and audience from the registry entry, so there is nothing to check
// beyond the schema.
function checkFederation(path, federation, entry) {
  const label = `federation ${federation.name}`

  if (federation.host === 'cdp') {
    return []
  }

  const issuer = `https://login.microsoftonline.com/${entry.entra.tenantId}/v2.0`

  if (federation.issuer !== issuer) {
    return [problem(path, `${label} issuer is not the Defra tenant`)]
  }

  if (!GUID.test(federation.subject)) {
    return [problem(path, `${label} subject must be a principal ID`)]
  }

  return []
}

function checkOauth(path, document, entry) {
  const { oauth } = document

  if (!oauth) {
    return []
  }

  if (!teamRegistrations(entry) && oauth.federations.length > 0) {
    return [
      problem(
        path,
        `federations need a team registration, which ${entry.name} does not create`
      )
    ]
  }

  const problems = []
  const names = new Set()
  const workloads = new Map()

  for (const federation of oauth.federations) {
    if (names.has(federation.name)) {
      problems.push(problem(path, `federation ${federation.name} is repeated`))
    }

    names.add(federation.name)

    // Entra refuses two federated credentials on one registration for the
    // same issuer and subject, so two names for one workload never apply.
    const workload = federationKey(federation)
    if (workloads.has(workload)) {
      problems.push(
        problem(
          path,
          `federations ${workloads.get(workload)} and ${federation.name} both trust ${workload}`
        )
      )
    }

    workloads.set(workload, federation.name)
    problems.push(...checkFederation(path, federation, entry))
  }

  const clientIds = new Set()
  for (const client of oauth.externalClients) {
    if (clientIds.has(client.clientId)) {
      problems.push(problem(path, `external client ${client.name} is repeated`))
    }

    clientIds.add(client.clientId)
  }

  if (1 + oauth.externalClients.length > MAX_CLIENTS) {
    problems.push(
      problem(path, `a team may list at most ${MAX_CLIENTS} clients`)
    )
  }

  if (oauth.secretsAllowed && entry.class === 'consumer-production') {
    if (!oauth.exception) {
      problems.push(
        problem(path, 'secrets in production need an exception naming the host')
      )
    } else if (/\bcdp\b/i.test(oauth.exception.host)) {
      problems.push(
        problem(path, 'a CDP service can federate, so it never gets a secret')
      )
    }
  }

  return problems
}

const DAY_MS = 24 * 60 * 60 * 1000
// Cooling-off by environment class where the registry entry names none
// (design C #deletion: DEV 2, QA 7, PREPROD and PROD 14, all TBC).
const COOLING_OFF_BY_CLASS = {
  'platform-test': 0,
  sandbox: 0,
  'consumer-lower': 2,
  'consumer-production': 14,
  'shared-service': 14
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

/**
 * The days a team cools off in pending-removal before it may be removed:
 * the registry entry's removal.coolingOffDays, else its class's.
 *
 * @param {object} entry - Registry entry.
 * @returns {number} Days.
 */
function coolingOffDays(entry) {
  return entry.removal?.coolingOffDays ?? COOLING_OFF_BY_CLASS[entry.class]
}

/**
 * The removal lifecycle (design C #deletion): a team enters pending-removal
 * with removeAfter at least the environment's cooling-off away, is removed
 * once that date has passed, and may return to active at any point. Where
 * the cooling-off is zero (Infradev) an active team may be removed in one
 * step. Nothing checks a file against itself, so this runs on a change only.
 *
 * @param {string} path - Team file path.
 * @param {object} document - The team file as written.
 * @param {object | null} previous - The file before the change.
 * @param {object} entry - Registry entry, for removal.coolingOffDays.
 * @param {Date} now - The moment of the check.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function checkLifecycle(path, document, previous, entry, now) {
  const coolingOff = coolingOffDays(entry)
  const today = isoDate(now)

  if (document.status === 'pending-removal') {
    const unchanged =
      previous?.status === 'pending-removal' &&
      previous.removeAfter === document.removeAfter
    const earliest = isoDate(new Date(now.getTime() + coolingOff * DAY_MS))

    if (!unchanged && document.removeAfter < earliest) {
      return [
        problem(
          path,
          `removeAfter must be ${earliest} or later: ${entry.name} cools off for ${coolingOff} days`
        )
      ]
    }
  }

  if (document.status === 'removed' && previous?.status !== 'removed') {
    if (!previous) {
      return [problem(path, 'a new team is never removed')]
    }

    if (previous.status === 'pending-removal' && today < previous.removeAfter) {
      return [problem(path, `removal is scheduled for ${previous.removeAfter}`)]
    }

    if (previous.status === 'active' && coolingOff > 0) {
      return [
        problem(
          path,
          `a team is removed only after pending-removal: ${entry.name} cools off for ${coolingOff} days`
        )
      ]
    }
  }

  return []
}

/**
 * Whether a team file may be deleted: only once it is removed, so that the
 * apply that follows the deletion finds nothing of the team's to destroy.
 *
 * @param {string} path - Team file path.
 * @param {string | null} previousText - The file before the deletion.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function checkDeletion(path, previousText) {
  const previous = previousText ? JSON.parse(previousText) : null

  if (previous?.status === 'removed') {
    return []
  }

  return [
    problem(
      path,
      previous
        ? `a ${previous.status} team file is deleted only once it is removed`
        : 'nothing to delete'
    )
  ]
}

/**
 * Subscription keys belong to the Research tier, and the Research tier to one
 * platform-owned file: an engineer commits it, no writer App does, and no team
 * can acquire a key by editing its own file (direction 14 October 2026).
 *
 * @param {string} path - Team file path.
 * @param {object} document - The team file as written.
 * @param {boolean} [writer] - A writer App authored the change.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function checkResearchFile(path, document, writer) {
  const research = document.team.slug === RESEARCH_SLUG
  const key = document.gateway.credentialType === SUBSCRIPTION_KEY
  const problems = []

  if (key && !research) {
    problems.push(
      problem(
        path,
        `only the platform-owned ${RESEARCH_SLUG} file may use ` +
          `${SUBSCRIPTION_KEY}; a team is OAuth only`
      )
    )
  }

  if (research && !key) {
    problems.push(
      problem(
        path,
        `${RESEARCH_SLUG} is the platform's, not a team's: its file uses ` +
          SUBSCRIPTION_KEY
      )
    )
  }

  if (research && writer) {
    problems.push(
      problem(
        path,
        `the ${RESEARCH_SLUG} file is platform-owned: an engineer commits ` +
          'it, never a writer App'
      )
    )
  }

  return problems
}

/**
 * Validates one team file as written: path, size, serialisation, schema,
 * revision, catalogue, gateway and OAuth rules.
 *
 * @param {object} input - The file and its context.
 * @param {string} input.path - Repository-relative path.
 * @param {string} input.text - File contents at the head commit.
 * @param {string | null} input.previousText - Contents at the base commit.
 * @param {object} input.entry - The environment's registry entry.
 * @param {object} input.params - The environment's parameters.
 * @param {Map<string, object>} input.models - Catalogue models by slug.
 * @param {Record<string, Function>} input.validators - Schema validators.
 * @param {string} [input.operationId] - Operation the change belongs to.
 * @param {boolean} [input.writer] - A writer App authored the change.
 * @param {boolean} [input.onMain] - The file is already on main, so its
 *   deployments are grants it holds rather than new ones.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function checkTeamFile(input) {
  const { path, text, previousText, entry, validators, operationId } = input
  const location = parseTeamPath(path)

  if (!location) {
    return [problem(path, 'team files live at environments/{env}/{slug}.json')]
  }

  if (Buffer.byteLength(text, 'utf8') >= MAX_FILE_BYTES) {
    return [problem(path, 'team file must be under 60 KB')]
  }

  if (!isCanonical(text)) {
    return [problem(path, 'team file is not in canonical serialisation')]
  }

  const document = JSON.parse(text)
  const schemaProblems = validators.team(document)

  if (schemaProblems.length > 0) {
    return schemaProblems.map((message) => problem(path, message))
  }

  const problems = []

  if (document.team.slug !== location.slug) {
    problems.push(problem(path, 'file name must equal team.slug'))
  }

  if (document.environment !== location.environment) {
    problems.push(problem(path, 'environment must equal the folder'))
  }

  if (location.environment !== entry.name) {
    problems.push(problem(path, `folder is not registry entry ${entry.name}`))
  }

  if (operationId && document.operationId !== operationId) {
    problems.push(problem(path, `operationId must be ${operationId}`))
  }

  problems.push(...checkResearchFile(path, document, input.writer))

  const previous = previousText ? JSON.parse(previousText) : null

  if (previous && document.revision <= previous.revision) {
    problems.push(
      problem(path, `revision must be greater than ${previous.revision}`)
    )
  }

  if (document.status === 'removed') {
    if (document.deployments.length > 0 || document.oauth) {
      problems.push(problem(path, 'a removed team keeps no resources'))
    }
  }

  if (!input.onMain) {
    problems.push(
      ...checkLifecycle(
        path,
        document,
        previous,
        entry,
        input.now ?? new Date()
      )
    )
  }

  problems.push(
    ...checkDeployments(
      path,
      document,
      input.onMain ? document : previous,
      input
    )
  )
  problems.push(...checkGateway(path, document))
  problems.push(...checkOauth(path, document, entry))

  return problems
}

/**
 * The catalogue's half of the research reconciliation: a model it offers to
 * the Research tier in this environment, and which is grantable, must be in
 * the research file, or the backend issues a key that fails at the gateway
 * because nothing deployed the name the portal tells people to call. The
 * file's half (every deployment is a catalogue model with its deploymentName)
 * is checkDeployments.
 *
 * @param {object} input - The research file and the catalogue.
 * @param {string} input.path - Research file path.
 * @param {object} input.document - The research file.
 * @param {string} input.environment - Environment name.
 * @param {Map<string, object>} input.models - Catalogue models by slug.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function checkResearchCoverage({ path, document, environment, models }) {
  const listed = new Set(document.deployments.map((d) => d.slug))
  const problems = []

  for (const [slug, model] of models) {
    const offered =
      model.tiers.includes('research') &&
      model.eligibility.eligible &&
      model.environments.includes(environment) &&
      GRANTABLE.has(model.lifecycle.status)

    if (offered && !listed.has(slug)) {
      problems.push(
        problem(
          path,
          `the catalogue offers ${slug} to the research tier in ${environment}; ` +
            `add it to the research file as ${model.deploymentName}`
        )
      )
    }
  }

  return problems
}

/**
 * Rules across every team file in one environment: capacity per model
 * against the environment quota, deployments per Foundry account against
 * Azure's limit, one team per CDP service, and the research file against the
 * catalogue's research models.
 *
 * @param {object} input - The environment's team files.
 * @param {Array<{path: string, document: object}>} input.teams - Parsed,
 *   schema-valid team files.
 * @param {string} input.environment - Environment name.
 * @param {Map<string, object>} input.models - Catalogue models by slug.
 * @param {object} input.params - The environment's effective parameters.
 * @param {object} input.entry - The environment's registry entry.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function checkEnvironmentTeams({ teams, environment, models, params, entry }) {
  const problems = []
  const capacity = new Map()
  const perAccount = new Map()
  const trusted = new Map()
  let registrations = 0

  for (const { path, document } of teams) {
    for (const deployment of document.deployments) {
      capacity.set(
        deployment.slug,
        (capacity.get(deployment.slug) ?? 0) + deployment.capacity
      )

      const sku = skusForTier(
        models.get(deployment.slug) ?? { skus: [] },
        tierOf(document)
      ).find((candidate) => candidate.name === deployment.sku)
      const region = sku && regionFor(sku, params)
      if (region) {
        perAccount.set(region, (perAccount.get(region) ?? 0) + 1)
      }
    }

    if (document.team.slug === RESEARCH_SLUG && document.status !== 'removed') {
      problems.push(
        ...checkResearchCoverage({ path, document, environment, models })
      )
    }

    if (document.oauth && teamRegistrations(entry)) {
      registrations += 1
    }

    for (const federation of document.oauth?.federations ?? []) {
      const key = federationKey(federation)
      const owner = trusted.get(key)

      if (owner && owner !== document.team.slug) {
        problems.push(problem(path, `${key} is already trusted by ${owner}`))
      }

      trusted.set(key, document.team.slug)
    }
  }

  const limit = entry.entra.createdObjectLimit ?? DEFAULT_CREATED_OBJECT_LIMIT
  const entraObjects =
    PLATFORM_ENTRA_OBJECTS + ENTRA_OBJECTS_PER_TEAM * registrations

  if (entraObjects > limit) {
    problems.push(
      problem(
        `environments/${environment}`,
        `${registrations} teams need ${entraObjects} Entra objects from the ` +
          `${environment} deploy identity; its limit is ${limit}`
      )
    )
  }

  for (const [slug, total] of capacity) {
    const model = models.get(slug)

    if (!model) {
      continue
    }

    const { quota } = capacityPolicyFor(model, environment)
    if (quota === undefined || total > quota) {
      problems.push(
        problem(
          `environments/${environment}`,
          `${slug} capacity ${total} exceeds the ${environment} quota ` +
            `${quota ?? 'which is not set'}`
        )
      )
    }
  }

  for (const [region, count] of perAccount) {
    if (count > MAX_DEPLOYMENTS_PER_ACCOUNT) {
      problems.push(
        problem(
          `environments/${environment}`,
          `the ${region} Foundry account would hold ${count} model deployments; ` +
            `Azure allows ${MAX_DEPLOYMENTS_PER_ACCOUNT}`
        )
      )
    }
  }

  return problems
}

export {
  checkDeletion,
  checkEnvironmentTeams,
  checkLifecycle,
  checkTeamFile,
  coolingOffDays,
  federationKey,
  parseTeamPath,
  regionFor
}
