import {
  explainedRemovals,
  guardPlan,
  tenantsRemovals
} from '../../src/plan-guard.js'
import {
  keyTeam,
  oauthTeam,
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
      overridden: false
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
      overridden: false
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

  test('allows an unexplained delete under allow_destroy and reports it', () => {
    const plan = planWith([DEPLOYMENT, ['delete']])

    expect(
      guardPlan({ plan, state: 'tenants', allowDestroy: true })
    ).toMatchObject({ allowed: true, overridden: true })
  })
})

describe('explainedRemovals', () => {
  test('explains a removed team', () => {
    const before = new Map([['alpha', keyTeam()]])

    expect(explainedRemovals(before, new Map())).toEqual([
      'module.team["alpha"]'
    ])
  })

  test('explains a removed deployment', () => {
    const before = new Map([['alpha', keyTeam()]])
    const after = new Map([['alpha', keyTeam({ deployments: [] })]])

    expect(explainedRemovals(before, after)).toEqual([
      'module.team["alpha"].module.deployment["gpt-5-nano"]'
    ])
  })

  test('explains a removed OAuth registration', () => {
    const { oauth, ...rest } = oauthTeam()
    const before = new Map([['beta', oauthTeam()]])
    const after = new Map([
      [
        'beta',
        {
          ...rest,
          gateway: { ...rest.gateway, credentialType: 'subscription-key' }
        }
      ]
    ])

    expect(explainedRemovals(before, after)).toEqual([
      'module.team["beta"].module.registration[0]'
    ])
  })

  test('explains a federation that points at a new CDP service', () => {
    const team = oauthTeam()
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
    const before = new Map([['alpha', keyTeam()]])

    expect(explainedRemovals(before, new Map(before))).toEqual([])
  })
})

describe('tenantsRemovals', () => {
  test('reads both commits and explains a deleted team file', () => {
    const repository = createRepository()

    try {
      repository.write(teamPath(keyTeam()), serialise(keyTeam()))
      const base = repository.commit('chore: alpha')
      repository.remove(teamPath(keyTeam()))
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
      repository.write(teamPath(keyTeam()), serialise(keyTeam()))
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
