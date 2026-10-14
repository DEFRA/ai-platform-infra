import { capacityPolicyFor, skusForTier } from './catalogue.js'
import { isCanonical } from './canonical-json.js'

const MAX_FILE_BYTES = 60 * 1024
const MAX_CLIENTS = 40
const TEAM_PATH = /^environments\/([a-z][a-z0-9]{1,15})\/([^/]+)\.json$/
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const GRANTABLE = new Set(['available', 'eligible'])
// Every team's dedicated deployments share the environment's Foundry account
// in a region, and Azure allows 32 model deployments per Foundry resource
// (Microsoft Learn, Foundry Models quotas and limits, checked 14 Oct 2026).
const MAX_DEPLOYMENTS_PER_ACCOUNT = 32
// Entra counts every object a principal without an Entra role creates,
// soft-deleted ones included, up to 250 (Microsoft Learn, Microsoft Entra
// service limits, checked 14 Oct 2026). The deploy identity creates the
// platform's API audience registration and its service principal, and the
// same pair for each OAuth team.
const DEFAULT_CREATED_OBJECT_LIMIT = 250
const PLATFORM_ENTRA_OBJECTS = 2
const ENTRA_OBJECTS_PER_OAUTH_TEAM = 2

function problem(file, message) {
  return { file, message }
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
    params.foundry_regions.includes(region)
  )
}

function checkDeployments(path, document, previous, context) {
  const { models, params } = context
  const environment = document.environment
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

    if (!model.tiers.includes('team') || !model.eligibility.eligible) {
      problems.push(problem(path, `${label} is not eligible for teams`))
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

    const sku = skusForTier(model, 'team').find(
      (candidate) => candidate.name === deployment.sku
    )

    if (!sku) {
      problems.push(problem(path, `${label} sku ${deployment.sku} not allowed`))
    } else if (!regionFor(sku, params)) {
      problems.push(
        problem(path, `${label} has no Foundry region in ${environment}`)
      )
    }

    const policy = capacityPolicyFor(model, environment)
    if (deployment.capacity < policy.min || deployment.capacity > policy.max) {
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
  const dedicated = new Set(document.deployments.map((d) => d.slug))

  for (const slug of document.gateway.allowedDeployments) {
    if (!dedicated.has(slug)) {
      problems.push(
        problem(
          path,
          `allowedDeployments ${slug} is not a dedicated deployment of ` +
            'this team; shared Research grants are not built yet'
        )
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

  if (!entry.entra.enabled) {
    return [problem(path, `oauth is not enabled in ${entry.name}`)]
  }

  const problems = []
  const names = new Set()

  for (const federation of oauth.federations) {
    if (names.has(federation.name)) {
      problems.push(problem(path, `federation ${federation.name} is repeated`))
    }

    names.add(federation.name)
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
 * Rules across every team file in one environment: capacity per model
 * against the environment quota, deployments per Foundry account against
 * Azure's limit, and one team per CDP service.
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
  let oauthTeams = 0

  for (const { path, document } of teams) {
    for (const deployment of document.deployments) {
      capacity.set(
        deployment.slug,
        (capacity.get(deployment.slug) ?? 0) + deployment.capacity
      )

      const sku = skusForTier(
        models.get(deployment.slug) ?? { skus: [] },
        'team'
      ).find((candidate) => candidate.name === deployment.sku)
      const region = sku && regionFor(sku, params)
      if (region) {
        perAccount.set(region, (perAccount.get(region) ?? 0) + 1)
      }
    }

    if (document.oauth) {
      oauthTeams += 1
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
    PLATFORM_ENTRA_OBJECTS + ENTRA_OBJECTS_PER_OAUTH_TEAM * oauthTeams

  if (entraObjects > limit) {
    problems.push(
      problem(
        `environments/${environment}`,
        `${oauthTeams} OAuth teams need ${entraObjects} Entra objects from the ` +
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
  checkEnvironmentTeams,
  checkTeamFile,
  federationKey,
  parseTeamPath,
  regionFor
}
