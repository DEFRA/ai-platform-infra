import { commitsWithTrailers } from './git.js'
import { TEAM_ADDRESS } from './plan-guard.js'

const KINDS = ['create', 'update', 'delete', 'replace']

function kindOf(actions) {
  if (actions.includes('delete') && actions.includes('create')) {
    return 'replace'
  }

  return KINDS.find((kind) => actions.includes(kind)) ?? null
}

function emptyCounts() {
  return Object.fromEntries(KINDS.map((kind) => [kind, 0]))
}

function teamOf(address) {
  return TEAM_ADDRESS.exec(address ?? '')?.[1] ?? null
}

/**
 * Change counts from a saved plan, in total and per team.
 *
 * @param {object | null} plan - Output of `terraform show -json`.
 * @returns {{total: object, teams: Record<string, object>}} Counts.
 */
function summariseChanges(plan) {
  const total = emptyCounts()
  const teams = {}

  for (const change of plan?.resource_changes ?? []) {
    const kind = kindOf(change.change.actions)

    if (!kind) {
      continue
    }

    total[kind] += 1
    const team = teamOf(change.address)

    if (team) {
      teams[team] ??= emptyCounts()
      teams[team][kind] += 1
    }
  }

  return { total, teams }
}

/**
 * Errors from a `terraform apply -json` log, attributed to a team where
 * the failing address belongs to one (R3).
 *
 * @param {string} log - JSON lines from the apply.
 * @returns {Array<{address: string | null, team: string | null,
 *   summary: string}>} Failures.
 */
function parseFailures(log) {
  const failures = []

  for (const line of (log ?? '').split('\n')) {
    let event

    try {
      event = JSON.parse(line)
    } catch {
      continue
    }

    if (event.type === 'diagnostic' && event.diagnostic?.severity === 'error') {
      const address = event.diagnostic.address ?? null

      failures.push({
        address,
        team: teamOf(address),
        summary: event.diagnostic.summary
      })
    } else if (event.type === 'apply_errored') {
      const address = event.hook?.resource?.addr ?? null

      failures.push({
        address,
        team: teamOf(address),
        summary: `${event.hook?.action ?? 'apply'} failed`
      })
    }
  }

  return failures
}

/**
 * The run report a backend reads to match an apply to its operations
 * (R12): applied SHA, operation IDs from trailers since the last applied
 * commit, change counts, failing teams and the resources each team now
 * has. Never contains a secret: outputs are non-sensitive by design.
 *
 * @param {object} input - Run facts.
 * @returns {object} The report.
 */
function buildRunReport(input) {
  const {
    repoDir,
    base,
    head,
    environment,
    state,
    plan,
    applyLog,
    outputs,
    outcome,
    release,
    run
  } = input
  const path =
    state === 'platform'
      ? `environments/${environment}/platform.json`
      : `environments/${environment}`
  const failures = parseFailures(applyLog)
  const failingTeams = [
    ...new Set(failures.map((failure) => failure.team).filter(Boolean))
  ].sort()

  return {
    schemaVersion: 1,
    repository: run.repository,
    environment,
    state,
    release,
    run: { id: run.id, attempt: run.attempt, url: run.url },
    outcome,
    appliedSha: head,
    baseSha: base ?? null,
    operations: commitsWithTrailers(repoDir, base, head, path),
    changes: summariseChanges(plan),
    failingTeams,
    // A failure with no parsed error, or one naming no team, is not
    // attributable to a team.
    unattributedFailure:
      outcome !== 'success' &&
      (failures.length === 0 || failures.some((failure) => !failure.team)),
    failures,
    entraObjects: plan
      ? countEntraObjects(plan.planned_values?.root_module)
      : null,
    outputs: withoutSensitive(outputs),
    generatedAt: new Date().toISOString()
  }
}

const ENTRA_OBJECT_TYPES = new Set([
  'azuread_application',
  'azuread_service_principal'
])

/**
 * How many Entra objects a state holds once its plan is applied, which
 * count towards the deploy identity's created-object limit.
 *
 * @param {object | null} module - `planned_values.root_module` of a plan.
 * @returns {number} Applications and service principals.
 */
function countEntraObjects(module) {
  const own = (module?.resources ?? []).filter(
    (resource) =>
      resource.mode === 'managed' && ENTRA_OBJECT_TYPES.has(resource.type)
  ).length

  return (module?.child_modules ?? []).reduce(
    (total, child) => total + countEntraObjects(child),
    own
  )
}

/**
 * `terraform output -json` prints sensitive values in plain text; the run
 * report keeps only outputs Terraform does not mark sensitive.
 *
 * @param {Record<string, {sensitive: boolean}> | null} outputs - Outputs.
 * @returns {Record<string, object>} Non-sensitive outputs.
 */
function withoutSensitive(outputs) {
  return Object.fromEntries(
    Object.entries(outputs ?? {}).filter(([, output]) => !output.sensitive)
  )
}

export {
  buildRunReport,
  countEntraObjects,
  parseFailures,
  summariseChanges,
  withoutSensitive
}
