import { guardPlan, tenantsRemovals } from '../../src/plan-guard.js'
import { buildTeamsVariables } from '../../src/teams-variables.js'
import { loadContext, validateTenantsChange } from '../../src/validate.js'
import {
  alphaTeam,
  ENVIRONMENTS_DIR,
  INFRA_DIR,
  serialise,
  teamPath
} from '../fixtures/gitops-files.js'
import { createRepository } from '../helpers/repository.js'

const context = loadContext({
  infraDir: INFRA_DIR,
  environmentsDir: ENVIRONMENTS_DIR
})
const WRITER = 'ai-platform-orchestrator[bot]'
const TEAM = 'module.team["alpha"]'
const NANO = alphaTeam().deployments[0]
const SECOND = {
  capacity: 1,
  sku: 'DataZoneStandard',
  slug: 'gpt-4-1-nano',
  status: 'active'
}

// The whole file the Portal API submits for one change: the next revision,
// the change's operation, and grants kept in step with the deployments.
function revision(number, deployments) {
  const team = alphaTeam()

  return {
    ...team,
    revision: number,
    operationId: `alpha-change-${String(number).padStart(4, '0')}`,
    deployments,
    gateway: {
      ...team.gateway,
      allowedDeployments: deployments.map((deployment) => deployment.slug)
    }
  }
}

describe('a team file through its life, as the Portal API submits it', () => {
  let repository
  let head

  function submit(document) {
    const base = head
    repository.write(teamPath(document), serialise(document))
    head = repository.commit(
      `chore(infradev): write alpha\n\nOperation-Id: ${document.operationId}`
    )

    return validateTenantsChange({
      repoDir: repository.dir,
      base,
      head,
      context,
      author: WRITER,
      operationId: document.operationId
    }).problems.map((problem) => problem.message)
  }

  beforeAll(() => {
    repository = createRepository()
    repository.write('README.md', '# state\n')
    head = repository.commit('chore: initialise')
  })

  afterAll(() => repository.destroy())

  test('creates the file with its first model (revision 1)', () => {
    expect(submit(revision(1, [NANO]))).toEqual([])
  })

  test('adds a model as the next revision of the same file', () => {
    expect(submit(revision(2, [NANO, SECOND]))).toEqual([])
    expect(
      Object.keys(
        buildTeamsVariables({
          repoDir: repository.dir,
          ref: head,
          environment: 'infradev'
        }).teams.alpha.deployments
      )
    ).toHaveLength(2)
  })

  test('refuses a change built on a stale read of the file', () => {
    expect(submit(revision(2, [NANO, { ...SECOND, capacity: 2 }]))).toContain(
      'revision must be greater than 2'
    )
  })

  test('changes a capacity as the next revision', () => {
    expect(submit(revision(3, [NANO, { ...SECOND, capacity: 2 }]))).toEqual([])
  })

  test('removes a model, and the apply may delete only that deployment', () => {
    const base = head

    expect(submit(revision(4, [NANO]))).toEqual([])

    const explained = tenantsRemovals({
      repoDir: repository.dir,
      base,
      head,
      environment: 'infradev'
    })
    expect(explained).toEqual([
      `${TEAM}.module.deployment["gpt-4-1-nano"]`,
      `${TEAM}.module.api.azurerm_api_management_api_operation.this`
    ])

    function planDeleting(address) {
      return {
        resource_changes: [{ address, change: { actions: ['delete'] } }]
      }
    }

    expect(
      guardPlan({
        plan: planDeleting(
          `${TEAM}.module.deployment["gpt-4-1-nano"].azurerm_cognitive_deployment.this`
        ),
        state: 'tenants',
        explained
      }).allowed
    ).toBe(true)
    expect(
      guardPlan({
        plan: planDeleting(
          `${TEAM}.module.api.azurerm_api_management_api_operation.this["chat-v1"]`
        ),
        state: 'tenants',
        explained
      }).allowed
    ).toBe(true)
    expect(
      guardPlan({
        plan: planDeleting(`${TEAM}.module.project.azapi_resource.this`),
        state: 'tenants',
        explained
      }).allowed
    ).toBe(false)
  })

  test('applies the latest file, traced to the change that last touched it', () => {
    const variables = buildTeamsVariables({
      repoDir: repository.dir,
      ref: head,
      environment: 'infradev'
    })

    expect(variables.teams.alpha.deployments).toEqual([NANO])
    expect(variables.team_sources.alpha).toEqual({
      sha: head,
      operation_id: 'alpha-change-0004'
    })
  })
})
