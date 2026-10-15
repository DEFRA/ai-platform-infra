import { loadCatalogue, modelsBySlug } from '../../src/catalogue.js'
import { loadValidators } from '../../src/schemas.js'
import {
  checkEnvironmentTeams,
  checkTeamFile,
  parseTeamPath
} from '../../src/team-rules.js'
import {
  environmentParams,
  INFRA_DIR,
  alphaTeam,
  betaTeam,
  registryEntry,
  serialise,
  teamPath
} from '../fixtures/gitops-files.js'

const validators = loadValidators(INFRA_DIR)
const models = modelsBySlug(loadCatalogue(INFRA_DIR))

function check(document, options = {}) {
  return checkTeamFile({
    path: teamPath(document),
    text: serialise(document),
    previousText: null,
    entry: registryEntry(),
    params: environmentParams(),
    models,
    validators,
    ...options
  }).map((problem) => problem.message)
}

function withDeployment(changes, team = alphaTeam()) {
  return {
    ...team,
    deployments: [{ ...team.deployments[0], ...changes }]
  }
}

function withOauth(changes) {
  const team = betaTeam()

  return { ...team, oauth: { ...team.oauth, ...changes } }
}

describe('checkTeamFile', () => {
  test.each([
    ['key', alphaTeam()],
    ['OAuth', betaTeam()]
  ])('accepts the %s team example', (_, document) => {
    expect(check(document)).toEqual([])
  })

  test('refuses a file outside environments/{env}/', () => {
    expect(
      checkTeamFile({
        path: 'teams/alpha.json',
        text: '{}',
        entry: registryEntry(),
        validators
      })
    ).toEqual([
      {
        file: 'teams/alpha.json',
        message: 'team files live at environments/{env}/{slug}.json'
      }
    ])
  })

  test('refuses a file of 60 KB or more', () => {
    const big = alphaTeam({ $schema: 'x'.repeat(61440) })

    expect(check(big)).toEqual(['team file must be under 60 KB'])
  })

  describe('model lifecycle', () => {
    function withStatus(status) {
      const model = models.get('gpt-5-nano')

      return new Map(models).set('gpt-5-nano', {
        ...model,
        lifecycle: { ...model.lifecycle, status }
      })
    }

    const held = { previousText: serialise(alphaTeam({ revision: 0 })) }

    test('refuses a new grant of a deprecated model', () => {
      expect(
        check(alphaTeam(), { models: withStatus('deprecated') })
      ).toContain('deployment gpt-5-nano is deprecated: no new grants')
    })

    test.each([
      ['a change that keeps it', held],
      ['the whole environment on main', { onMain: true }]
    ])('keeps a deprecated grant through %s', (_, options) => {
      expect(
        check(alphaTeam(), { models: withStatus('deprecated'), ...options })
      ).toEqual([])
    })

    test('refuses a retired model even where the team held it', () => {
      expect(
        check(alphaTeam(), { models: withStatus('retired'), onMain: true })
      ).toContain('deployment gpt-5-nano is retired: no grants')
    })
  })

  test('refuses text that is not canonical', () => {
    const document = alphaTeam()

    expect(check(document, { text: JSON.stringify(document) })).toEqual([
      'team file is not in canonical serialisation'
    ])
  })

  test('refuses a file name that differs from the slug', () => {
    const document = alphaTeam()

    expect(
      check(document, { path: 'environments/infradev/gamma.json' })
    ).toContain('file name must equal team.slug')
  })

  test('refuses a folder that is not the environment', () => {
    const document = alphaTeam({ environment: 'sandbox' })

    expect(
      check(document, { path: 'environments/infradev/alpha.json' })
    ).toContain('environment must equal the folder')
  })

  test('refuses a revision that does not increase', () => {
    const previous = alphaTeam({ revision: 3 })

    expect(
      check(alphaTeam({ revision: 3 }), { previousText: serialise(previous) })
    ).toContain('revision must be greater than 3')
  })

  test('refuses an operation ID other than the branch operation', () => {
    expect(check(alphaTeam(), { operationId: 'other-operation' })).toContain(
      'operationId must be other-operation'
    )
  })

  test('refuses a deployment that is not in the catalogue', () => {
    const document = withDeployment({ slug: 'no-such-model' })

    expect(check(document)).toContain(
      'deployment no-such-model is not in the catalogue'
    )
  })

  test('refuses a model that is not offered to teams', () => {
    const document = {
      ...withDeployment({ slug: 'gpt-4o' }),
      gateway: { ...alphaTeam().gateway, allowedDeployments: ['gpt-4o'] }
    }

    expect(check(document)).toEqual(
      expect.arrayContaining([
        'deployment gpt-4o is not eligible for teams',
        'deployment gpt-4o is not offered in infradev'
      ])
    )
  })

  test('refuses a SKU the catalogue does not allow for teams', () => {
    expect(check(withDeployment({ sku: 'Standard' }))).toContain(
      'deployment gpt-5-nano sku Standard not allowed'
    )
  })

  test('refuses a deployment with no Foundry region in the environment', () => {
    const params = environmentParams({
      azure: { foundry: { regions: ['uksouth'] } }
    })

    expect(check(alphaTeam(), { params })).toContain(
      'deployment gpt-5-nano has no Foundry region in infradev'
    )
  })

  test('refuses capacity above the environment maximum', () => {
    expect(check(withDeployment({ capacity: 6 }))).toContain(
      'deployment gpt-5-nano capacity 6 is outside 1 to 5'
    )
  })

  test('refuses a deployment listed twice', () => {
    const team = alphaTeam()
    const document = {
      ...team,
      deployments: [team.deployments[0], team.deployments[0]]
    }

    expect(check(document)).toContain('deployment gpt-5-nano is listed twice')
  })

  test('refuses a grant that is not a dedicated deployment', () => {
    const team = alphaTeam()
    const document = {
      ...team,
      gateway: { ...team.gateway, allowedDeployments: ['gpt-4-1-nano'] }
    }

    expect(check(document)).toContain(
      'allowedDeployments gpt-4-1-nano is not a dedicated deployment of ' +
        'this team; shared Research grants are not built yet'
    )
  })

  test('refuses a token limit above the team capacity', () => {
    const team = alphaTeam()
    const document = {
      ...team,
      gateway: {
        ...team.gateway,
        limits: { tokensPerMinute: 1001, requestsPerMinute: 60 }
      }
    }

    expect(check(document)).toContain(
      "tokensPerMinute exceeds the team's capacity of 1000"
    )
  })

  test('refuses a removed team that keeps deployments', () => {
    const { oauth, ...team } = alphaTeam({ status: 'removed' })

    expect(check(team)).toContain('a removed team keeps no resources')
  })

  test('refuses a federation where Entra is not enabled', () => {
    const entry = registryEntry({
      entra: { enabled: false, tenantId: registryEntry().entra.tenantId }
    })

    expect(check(betaTeam(), { entry })).toContain(
      'federations need a team registration, which infradev does not create'
    )
  })

  test('refuses a federation where team registrations are off', () => {
    const entry = registryEntry({
      entra: { ...registryEntry().entra, teamRegistrations: false }
    })

    expect(check(betaTeam(), { entry })).toContain(
      'federations need a team registration, which infradev does not create'
    )
  })

  test('allows a team with no federation where team registrations are off', () => {
    const entry = registryEntry({
      entra: { ...registryEntry().entra, teamRegistrations: false }
    })

    expect(check(alphaTeam(), { entry })).toEqual([])
  })

  test('refuses a CDP federation that names its own issuer or subject', () => {
    const federation = {
      ...betaTeam().oauth.federations[0],
      subject: 'arn:aws:iam::111111111111:role/beta-api'
    }

    expect(check(withOauth({ federations: [federation] }))).toContainEqual(
      expect.stringContaining('/oauth/federations/0 must NOT be valid')
    )
  })

  test.each(['Beta_API', 'beta--api', '-beta', 'b'.repeat(33)])(
    'refuses %s, which CDP would not accept as a service',
    (service) => {
      const federation = { ...betaTeam().oauth.federations[0], service }

      expect(check(withOauth({ federations: [federation] }))).toContainEqual(
        expect.stringContaining('/oauth/federations/0/service must')
      )
    }
  )

  test('refuses an Azure federation without its issuer and subject', () => {
    const federation = {
      name: 'beta-func',
      host: 'azure',
      service: 'beta-func'
    }

    expect(check(withOauth({ federations: [federation] }))).toContainEqual(
      expect.stringContaining("must have required property 'issuer'")
    )
  })

  test('accepts an Azure federation from the Defra tenant', () => {
    const { tenantId } = registryEntry().entra
    const federation = {
      name: 'beta-func',
      host: 'azure',
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      subject: '22222222-2222-2222-2222-222222222222'
    }

    expect(check(withOauth({ federations: [federation] }))).toEqual([])
  })

  test('refuses an Azure federation from another tenant', () => {
    const federation = {
      name: 'beta-func',
      host: 'azure',
      issuer:
        'https://login.microsoftonline.com/' +
        '33333333-3333-3333-3333-333333333333/v2.0',
      subject: '22222222-2222-2222-2222-222222222222'
    }

    expect(check(withOauth({ federations: [federation] }))).toContain(
      'federation beta-func issuer is not the Defra tenant'
    )
  })

  test('refuses a federation name used twice', () => {
    const federation = betaTeam().oauth.federations[0]

    expect(
      check(withOauth({ federations: [federation, federation] }))
    ).toContain('federation beta-api is repeated')
  })

  test('refuses more than 40 clients for one team', () => {
    const externalClients = Array.from({ length: 40 }, (_, index) => ({
      name: `client-${index}`,
      tenantId: '44444444-4444-4444-4444-444444444444',
      clientId: `55555555-5555-5555-5555-${String(index).padStart(12, '0')}`
    }))

    expect(check(withOauth({ externalClients }))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/oauth/externalClients must NOT have more')
      ])
    )
  })

  describe('in a production environment', () => {
    const entry = registryEntry({ class: 'consumer-production' })

    test('refuses secrets without an exception', () => {
      expect(check(betaTeam(), { entry })).toContain(
        'secrets in production need an exception naming the host'
      )
    })

    test('refuses a secret exception for a CDP service', () => {
      const exception = {
        host: 'beta-api on CDP',
        reason: 'test',
        reviewDate: '2027-01-01'
      }

      expect(check(withOauth({ exception }), { entry })).toContain(
        'a CDP service can federate, so it never gets a secret'
      )
    })

    test('accepts a secret exception for a host that cannot federate', () => {
      const exception = {
        host: 'supplier SaaS',
        reason: 'no workload identity support',
        reviewDate: '2027-01-01'
      }

      expect(check(withOauth({ exception }), { entry })).toEqual([])
    })
  })
})

describe('checkEnvironmentTeams', () => {
  test('refuses team capacity where the environment has no quota', () => {
    const document = alphaTeam({ environment: 'sandbox' })

    expect(
      checkEnvironmentTeams({
        teams: [{ path: teamPath(document), document }],
        environment: 'sandbox',
        models,
        params: environmentParams(),
        entry: registryEntry()
      })
    ).toEqual([
      {
        file: 'environments/sandbox',
        message:
          'gpt-5-nano capacity 1 exceeds the sandbox quota which is not set'
      }
    ])
  })

  test('refuses capacity that together exceeds the environment quota', () => {
    const teams = Array.from({ length: 3 }, (_, index) => {
      const document = withDeployment(
        { capacity: 4 },
        alphaTeam({ team: { slug: `team-${index}`, serviceCode: 'ZZZ' } })
      )

      return { path: teamPath(document), document }
    })

    expect(
      checkEnvironmentTeams({
        teams,
        environment: 'infradev',
        models,
        params: environmentParams(),
        entry: registryEntry()
      })
    ).toEqual([
      {
        file: 'environments/infradev',
        message: 'gpt-5-nano capacity 12 exceeds the infradev quota 10'
      }
    ])
  })

  test('refuses more deployments than Azure allows in one Foundry account', () => {
    const teams = Array.from({ length: 33 }, (_, index) => {
      const document = alphaTeam({
        team: { slug: `team-${index}`, serviceCode: 'ZZZ' }
      })

      return { path: teamPath(document), document }
    })

    expect(
      checkEnvironmentTeams({
        teams,
        environment: 'infradev',
        models,
        params: environmentParams(),
        entry: registryEntry()
      })
    ).toContainEqual({
      file: 'environments/infradev',
      message:
        'the swedencentral Foundry account would hold 33 model deployments; Azure allows 32'
    })
  })

  test('refuses a CDP service trusted by two teams', () => {
    const first = betaTeam()
    const second = betaTeam({ team: { slug: 'gamma', serviceCode: 'ZZZ' } })
    const teams = [first, second].map((document) => ({
      path: teamPath(document),
      document
    }))

    expect(
      checkEnvironmentTeams({
        teams,
        environment: 'infradev',
        models,
        params: environmentParams(),
        entry: registryEntry()
      })
    ).toEqual([
      {
        file: 'environments/infradev/gamma.json',
        message: 'CDP service beta-api is already trusted by beta'
      }
    ])
  })

  describe("the deploy identity's Entra objects", () => {
    function oauthTeams(count) {
      return Array.from({ length: count }, (_, index) => {
        const document = betaTeam({
          team: { slug: `team-${index}`, serviceCode: 'ZZZ' },
          oauth: {
            ...betaTeam().oauth,
            federations: [
              { name: 'api', host: 'cdp', service: `service-${index}` }
            ]
          }
        })

        return { path: teamPath(document), document }
      })
    }

    function entraProblems(count, entra = {}) {
      const entry = registryEntry()

      return checkEnvironmentTeams({
        teams: oauthTeams(count),
        environment: 'infradev',
        models: new Map(),
        params: environmentParams(),
        entry: { ...entry, entra: { ...entry.entra, ...entra } }
      })
    }

    test('allows as many OAuth teams as the default limit of 250 holds', () => {
      expect(entraProblems(124)).toEqual([])
    })

    test('refuses an OAuth team past the default limit', () => {
      expect(entraProblems(125)).toEqual([
        {
          file: 'environments/infradev',
          message:
            '125 teams need 252 Entra objects from the infradev deploy ' +
            'identity; its limit is 250'
        }
      ])
    })

    test("follows the registry entry's limit", () => {
      expect(entraProblems(3, { createdObjectLimit: 7 })).toHaveLength(1)
    })

    test('counts no team objects where team registrations are off', () => {
      expect(entraProblems(125, { teamRegistrations: false })).toEqual([])
    })
  })
})

describe('parseTeamPath', () => {
  test('returns the environment and slug', () => {
    expect(parseTeamPath('environments/infradev/alpha.json')).toEqual({
      environment: 'infradev',
      slug: 'alpha'
    })
  })

  test('returns null for a nested path', () => {
    expect(parseTeamPath('environments/infradev/x/alpha.json')).toBeNull()
  })
})
