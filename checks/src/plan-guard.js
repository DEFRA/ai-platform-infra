import { listFilesAt, readFileAt } from './git.js'
import { federationKey, parseTeamPath } from './team-rules.js'

const TEAM_ADDRESS = /^module\.team\["([^"]+)"\]/

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
 * removed teams, removed deployments, removed OAuth registrations, and
 * removed or re-pointed federated credentials.
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
    for (const deployment of previous.deployments) {
      if (!kept.has(deployment.slug)) {
        prefixes.push(`${team}.module.deployment["${deployment.slug}"]`)
      }
    }

    if (previous.oauth && !current.oauth) {
      prefixes.push(`${team}.module.registration[0]`)
      continue
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
 * An engineer's allow_destroy dispatch overrides, and is reported.
 *
 * @param {object} input - The plan and what explains its deletes.
 * @param {object} input.plan - Output of `terraform show -json`.
 * @param {'platform' | 'tenants'} input.state - Which state.
 * @param {string[]} [input.explained] - Allowed address prefixes.
 * @param {boolean} [input.allowDestroy] - Engineer override.
 * @returns {{allowed: boolean, violations: Array<{address: string,
 *   actions: string[]}>, overridden: boolean}} Decision.
 */
function guardPlan({ plan, state, explained = [], allowDestroy = false }) {
  const violations = (plan.resource_changes ?? [])
    .filter((change) => isDestructive(change.change.actions))
    .filter(
      (change) =>
        state === 'platform' ||
        !explained.some((prefix) => covers(prefix, change.address))
    )
    .map((change) => ({
      address: change.address,
      actions: change.change.actions
    }))

  return {
    allowed: violations.length === 0 || allowDestroy,
    violations,
    overridden: violations.length > 0 && allowDestroy
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

export { explainedRemovals, guardPlan, teamsAt, tenantsRemovals, TEAM_ADDRESS }
