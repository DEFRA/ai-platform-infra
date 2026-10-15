import { lastCommitFor } from './git.js'
import { teamsAt } from './plan-guard.js'

/**
 * The tenants root's variables for one environment: every active team's
 * desired state, and for each team the commit and operation that last
 * changed its file, which become the aip-source-sha and aip-operation-id
 * tags on the team's resources.
 *
 * @param {object} input - Location.
 * @param {string} input.repoDir - Tenants checkout.
 * @param {string} input.ref - Commit being applied.
 * @param {string} input.environment - Environment name.
 * @returns {{teams: Record<string, object>,
 *   team_sources: Record<string, {sha: string, operation_id: string}>}}
 *   Variables for teams.auto.tfvars.json.
 */
function buildTeamsVariables({ repoDir, ref, environment }) {
  const teams = {}
  const sources = {}

  for (const [slug, document] of teamsAt(repoDir, ref, environment)) {
    const path = `environments/${environment}/${slug}.json`

    teams[slug] = document
    sources[slug] = {
      sha: lastCommitFor(repoDir, ref, path),
      operation_id: document.operationId
    }
  }

  return { teams, team_sources: sources }
}

export { buildTeamsVariables }
