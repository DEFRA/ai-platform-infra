import { listFilesAt, readFileAt } from './git.js'
import { federationKey, parseTeamPath } from './team-rules.js'

const TEAM_ADDRESS = /^module\.team\["([^"]+)"\]/
// Explained destroys in one tenants apply may span this many teams; more
// waits for an engineer's allow_destroy (direction 18 October 2026).
const MAX_TEAMS_DESTROYED_PER_APPLY = 1

function isDestructive(actions) {
  return actions.includes('delete')
}

function teamsAt(repoDir, ref, environment) {
  const teams = new Map()

  for (const path of listFilesAt(repoDir, ref, `environments/${environment}`)) {
    const location = parseTeamPath(path)
    const text = location && readFileAt(repoDir, ref, path)

    if (text) {
      const document = JSON.parse(text)
      if (document.status !== 'removed') {
        teams.set(location.slug, document)
      }
    }
  }

  return teams
}

/**
 * Address prefixes whose deletion or replacement the merged diff explains:
 * removed teams, removed deployments, and removed or re-pointed federated
 * credentials.
 *
 * @param {Map<string, object>} before - Teams at the last applied commit.
 * @param {Map<string, object>} after - Teams at the commit being applied.
 * @returns {string[]} Terraform address prefixes.
 */
function explainedRemovals(before, after) {
  const prefixes = []

  for (const [slug, previous] of before) {
    const team = `module.team["${slug}"]`
    const current = after.get(slug)

    if (!current) {
      prefixes.push(team)
      continue
    }

    const kept = new Set(current.deployments.map((d) => d.slug))
    let removedDeployment = false
    for (const deployment of previous.deployments) {
      if (!kept.has(deployment.slug)) {
        removedDeployment = true
        prefixes.push(`${team}.module.deployment["${deployment.slug}"]`)
      }
    }

    // The team API's operations follow its models' API profiles, so dropping
    // the last model of a profile deletes that profile's operations too.
    if (removedDeployment) {
      prefixes.push(
        `${team}.module.api.azurerm_api_management_api_operation.this`
      )
    }

    const federations = new Map(
      (current.oauth?.federations ?? []).map((f) => [f.name, f])
    )
    for (const federation of previous.oauth?.federations ?? []) {
      const next = federations.get(federation.name)

      if (!next || federationKey(next) !== federationKey(federation)) {
        prefixes.push(
          `${team}.module.registration[0].` +
            'azuread_application_federated_identity_credential.federation' +
            `["${federation.name}"]`
        )
      }
    }
  }

  return prefixes
}

function covers(prefix, address) {
  return (
    address === prefix ||
    address.startsWith(`${prefix}.`) ||
    address.startsWith(`${prefix}[`)
  )
}

/**
 * Refuses a saved plan that deletes or replaces anything the merged diff
 * does not explain (R2). In the platform state every delete is refused.
 * Explained destroys are capped at one team per apply (direction 18 October
 * 2026): a merge that would remove more teams than one at once waits for an
 * engineer's allow_destroy, so a mistaken sweep never runs unattended.
 * An engineer's allow_destroy dispatch overrides, and is reported.
 *
 * @param {object} input - The plan and what explains its deletes.
 * @param {object} input.plan - Output of `terraform show -json`.
 * @param {'platform' | 'tenants'} input.state - Which state.
 * @param {string[]} [input.explained] - Allowed address prefixes.
 * @param {boolean} [input.allowDestroy] - Engineer override.
 * @returns {{allowed: boolean, violations: Array<{address: string,
 *   actions: string[]}>, overridden: boolean, teamsDestroyed: string[]}}
 *   Decision.
 */
function guardPlan({ plan, state, explained = [], allowDestroy = false }) {
  const destructive = (plan.resource_changes ?? []).filter((change) =>
    isDestructive(change.change.actions)
  )
  const teamsDestroyed = [
    ...new Set(
      destructive
        .map((change) => TEAM_ADDRESS.exec(change.address)?.[1])
        .filter(Boolean)
    )
  ].sort()
  const overCap = teamsDestroyed.length > MAX_TEAMS_DESTROYED_PER_APPLY
  const violations = destructive
    .filter(
      (change) =>
        state === 'platform' ||
        overCap ||
        !explained.some((prefix) => covers(prefix, change.address))
    )
    .map((change) => ({
      address: change.address,
      actions: change.change.actions
    }))

  return {
    allowed: violations.length === 0 || allowDestroy,
    violations,
    overridden: violations.length > 0 && allowDestroy,
    teamsDestroyed,
    overCap
  }
}

/**
 * The removals a tenants apply may make, from the team files at the last
 * applied commit and at the commit being applied.
 *
 * @param {object} input - Location.
 * @param {string} input.repoDir - Tenants checkout with both commits.
 * @param {string | null} input.base - Last applied commit, or null.
 * @param {string} input.head - Commit being applied.
 * @param {string} input.environment - Environment name.
 * @returns {string[]} Terraform address prefixes.
 */
function tenantsRemovals({ repoDir, base, head, environment }) {
  return explainedRemovals(
    teamsAt(repoDir, base, environment),
    teamsAt(repoDir, head, environment)
  )
}

export {
  explainedRemovals,
  guardPlan,
  MAX_TEAMS_DESTROYED_PER_APPLY,
  teamsAt,
  tenantsRemovals,
  TEAM_ADDRESS
}
