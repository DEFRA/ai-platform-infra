import {
  explainedRemovals,
  guardPlan,
  tenantsRemovals
} from '../../src/plan-guard.js'
import {
  alphaTeam,
  betaTeam,
  serialise,
  teamPath
} from '../fixtures/gitops-files.js'
import { createRepository } from '../helpers/repository.js'

function planWith(...changes) {
  return {
    resource_changes: changes.map(([address, actions]) => ({
      address,
      change: { actions }
    }))
  }
}

const DEPLOYMENT =
  'module.team["alpha"].module.deployment["gpt-5-nano"]' +
  '.azurerm_cognitive_deployment.this'

describe('guardPlan', () => {
  test('allows creates and updates', () => {
    const plan = planWith(
      [DEPLOYMENT, ['create']],
      ['module.team["alpha"].azurerm_api_management_api.this', ['update']]
    )

    expect(guardPlan({ plan, state: 'tenants' })).toEqual({
      allowed: true,
      violations: [],
      overridden: false,
      teamsDestroyed: [],
      overCap: false
    })
  })

  test('refuses any delete in the platform state', () => {
    const plan = planWith([
      'module.apim.azurerm_api_management.this',
      ['delete']
    ])

    expect(guardPlan({ plan, state: 'platform' })).toEqual({
      allowed: false,
      violations: [
        {
          address: 'module.apim.azurerm_api_management.this',
          actions: ['delete']
        }
      ],
      overridden: false,
      teamsDestroyed: [],
      overCap: false
    })
  })

  test('refuses a replacement the diff does not explain', () => {
    const plan = planWith([DEPLOYMENT, ['delete', 'create']])

    expect(guardPlan({ plan, state: 'tenants', explained: [] }).allowed).toBe(
      false
    )
  })

  test('allows a delete under an explained prefix', () => {
    const plan = planWith([DEPLOYMENT, ['delete']])
    const explained = ['module.team["alpha"].module.deployment["gpt-5-nano"]']

    expect(guardPlan({ plan, state: 'tenants', explained }).allowed).toBe(true)
  })

  test('does not treat a team whose slug shares a prefix as explained', () => {
    const plan = planWith([
      'module.team["alpha-two"].azurerm_api_management_api.this',
      ['delete']
    ])
    const explained = ['module.team["alpha"]']

    expect(guardPlan({ plan, state: 'tenants', explained }).allowed).toBe(false)
  })

  test('allows the operations deleted with the last model, but nothing else of the API', () => {
    const before = new Map([['alpha', alphaTeam()]])
    const after = new Map([['alpha', alphaTeam({ deployments: [] })]])
    const operation = (id) =>
      `module.team["alpha"].module.api.azurerm_api_management_api_operation.this["${id}"]`
    const api =
      'module.team["alpha"].module.api.azurerm_api_management_api.this'
    const explained = explainedRemovals(before, after)

    expect(
      guardPlan({
        plan: planWith(
          [DEPLOYMENT, ['delete']],
          [operation('chat-deployment'), ['delete']],
          [operation('chat-v1'), ['delete']]
        ),
        state: 'tenants',
        explained
      }).allowed
    ).toBe(true)
    expect(
      guardPlan({
        plan: planWith([api, ['delete']]),
        state: 'tenants',
        explained
      }).allowed
    ).toBe(false)
    expect(
      guardPlan({
        plan: planWith([operation('chat-v1'), ['delete']]),
        state: 'tenants',
        explained: explainedRemovals(before, new Map(before))
      }).allowed
    ).toBe(false)
  })

  test('allows an unexplained delete under allow_destroy and reports it', () => {
    const plan = planWith([DEPLOYMENT, ['delete']])

    expect(
      guardPlan({ plan, state: 'tenants', allowDestroy: true })
    ).toMatchObject({ allowed: true, overridden: true })
  })

  describe('the cap of one team per apply', () => {
    const BETA = 'module.team["beta"].azurerm_api_management_api.this'
    const explained = ['module.team["alpha"]', 'module.team["beta"]']

    test('allows every explained destroy of one team, however many resources', () => {
      const plan = planWith(
        [DEPLOYMENT, ['delete']],
        [
          'module.team["alpha"].module.project.azurerm_cognitive_account_project.this',
          ['delete']
        ],
        [
          'module.team["alpha"].module.api.azurerm_api_management_api.this',
          ['delete']
        ]
      )

      expect(guardPlan({ plan, state: 'tenants', explained })).toMatchObject({
        allowed: true,
        teamsDestroyed: ['alpha'],
        overCap: false
      })
    })

    test('refuses explained destroys that span two teams', () => {
      const plan = planWith([DEPLOYMENT, ['delete']], [BETA, ['delete']])

      expect(guardPlan({ plan, state: 'tenants', explained })).toEqual({
        allowed: false,
        violations: [
          { address: DEPLOYMENT, actions: ['delete'] },
          { address: BETA, actions: ['delete'] }
        ],
        overridden: false,
        teamsDestroyed: ['alpha', 'beta'],
        overCap: true
      })
    })

    test('lets an engineer sweep several teams with allow_destroy, reported', () => {
      const plan = planWith([DEPLOYMENT, ['delete']], [BETA, ['delete']])

      expect(
        guardPlan({ plan, state: 'tenants', explained, allowDestroy: true })
      ).toMatchObject({ allowed: true, overridden: true, overCap: true })
    })

    test('counts a replacement as a destroy of its team', () => {
      const plan = planWith(
        [DEPLOYMENT, ['delete', 'create']],
        [BETA, ['create', 'delete']]
      )

      expect(
        guardPlan({ plan, state: 'tenants', explained }).teamsDestroyed
      ).toEqual(['alpha', 'beta'])
    })
  })
})

describe('explainedRemovals', () => {
  test('explains a removed team', () => {
    const before = new Map([['alpha', alphaTeam()]])

    expect(explainedRemovals(before, new Map())).toEqual([
      'module.team["alpha"]'
    ])
  })

  test('explains a removed deployment and the API operations that follow it', () => {
    const before = new Map([['alpha', alphaTeam()]])
    const after = new Map([['alpha', alphaTeam({ deployments: [] })]])

    expect(explainedRemovals(before, after)).toEqual([
      'module.team["alpha"].module.deployment["gpt-5-nano"]',
      'module.team["alpha"].module.api.azurerm_api_management_api_operation.this'
    ])
  })

  test('explains no API operations while every deployment is kept', () => {
    const before = new Map([['alpha', alphaTeam()]])

    expect(explainedRemovals(before, new Map(before))).toEqual([])
  })

  test('explains a federation that points at a new CDP service', () => {
    const team = betaTeam()
    const federation = {
      ...team.oauth.federations[0],
      service: 'beta-api-v2'
    }
    const before = new Map([['beta', team]])
    const after = new Map([
      ['beta', { ...team, oauth: { ...team.oauth, federations: [federation] } }]
    ])

    expect(explainedRemovals(before, after)).toEqual([
      'module.team["beta"].module.registration[0].' +
        'azuread_application_federated_identity_credential.federation' +
        '["beta-api"]'
    ])
  })

  test('explains nothing when a team is unchanged', () => {
    const before = new Map([['alpha', alphaTeam()]])

    expect(explainedRemovals(before, new Map(before))).toEqual([])
  })
})

describe('tenantsRemovals', () => {
  test('reads both commits and explains a deleted team file', () => {
    const repository = createRepository()

    try {
      repository.write(teamPath(alphaTeam()), serialise(alphaTeam()))
      const base = repository.commit('chore: alpha')
      repository.remove(teamPath(alphaTeam()))
      const head = repository.commit('chore: remove alpha')

      expect(
        tenantsRemovals({
          repoDir: repository.dir,
          base,
          head,
          environment: 'infradev'
        })
      ).toEqual(['module.team["alpha"]'])
    } finally {
      repository.destroy()
    }
  })

  test('explains nothing on the first apply', () => {
    const repository = createRepository()

    try {
      repository.write(teamPath(alphaTeam()), serialise(alphaTeam()))
      const head = repository.commit('chore: alpha')

      expect(
        tenantsRemovals({
          repoDir: repository.dir,
          base: null,
          head,
          environment: 'infradev'
        })
      ).toEqual([])
    } finally {
      repository.destroy()
    }
  })
})
