import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadValidators } from '../../src/schemas.js'
import {
  environmentParams,
  INFRA_DIR,
  alphaTeam,
  betaTeam,
  pin,
  registryEntry,
  researchTeam
} from '../fixtures/gitops-files.js'

const validators = loadValidators(INFRA_DIR)

describe('loadValidators', () => {
  test.each([
    ['team', 'ai-platform-tenants/environments/infradev/alpha.json'],
    ['team', 'ai-platform-tenants/environments/infradev/beta.json'],
    ['team', 'ai-platform-tenants/environments/infradev/research.json'],
    ['pin', 'ai-platform-deployments/environments/infradev/platform.json'],
    ['registry', 'ai-platform-environments/registry.json']
  ])('accepts the %s example %s', (schema, path) => {
    const document = JSON.parse(
      readFileSync(join(INFRA_DIR, 'examples', path), 'utf8')
    )

    expect(validators[schema](document)).toEqual([])
  })

  test('accepts the effective example environment parameters', () => {
    expect(validators.environment(environmentParams())).toEqual([])
  })

  test('rejects an unknown property in a team file', () => {
    expect(validators.team(alphaTeam({ billingCode: 'X1' }))).toContainEqual(
      '/ must NOT have additional properties (billingCode)'
    )
  })

  test('rejects a team file that names a resource', () => {
    const team = alphaTeam({ project: { name: 'aip-alpha' } })

    expect(validators.team(team)).toContainEqual(
      '/ must NOT have additional properties (project)'
    )
  })

  test('requires oauth for every team that is not removed', () => {
    const { oauth, ...team } = betaTeam()

    expect(validators.team(team)).toContain(
      "/ must have required property 'oauth'"
    )
  })

  test('refuses a credential type that is neither OAuth nor a subscription key', () => {
    const team = alphaTeam({
      gateway: { ...alphaTeam().gateway, credentialType: 'api-key' }
    })

    expect(validators.team(team)).toContain(
      '/gateway/credentialType must be equal to one of the allowed values'
    )
  })

  describe('a subscription key file', () => {
    test('takes no oauth block: a key is not a token', () => {
      const team = researchTeam({ oauth: betaTeam().oauth })

      expect(validators.team(team)).toContainEqual(
        expect.stringContaining('must NOT be valid')
      )
    })

    test('names every deployment, because nothing translates the name', () => {
      const [first, ...rest] = researchTeam().deployments
      const { deploymentName, ...unnamed } = first

      expect(
        validators.team(researchTeam({ deployments: [unnamed, ...rest] }))
      ).toContain("/deployments/0 must have required property 'deploymentName'")
    })

    test.each(['gpt 4o', '.gpt', 'gpt/4o', ''])(
      'refuses %j as a deployment name',
      (deploymentName) => {
        const [first, ...rest] = researchTeam().deployments

        expect(
          validators.team(
            researchTeam({
              deployments: [{ ...first, deploymentName }, ...rest]
            })
          )
        ).toContainEqual(
          expect.stringContaining('/deployments/0/deploymentName must match')
        )
      }
    )
  })

  test('refuses a deployment name in an OAuth file: a team names no resource', () => {
    const team = alphaTeam({
      deployments: [{ ...alphaTeam().deployments[0], deploymentName: 'mine' }]
    })

    expect(validators.team(team)).toContainEqual(
      expect.stringContaining('must NOT be valid')
    )
  })

  test('requires removeAfter when a team is pending removal', () => {
    const team = alphaTeam({ status: 'pending-removal' })

    expect(validators.team(team)).toContain(
      "/ must have required property 'removeAfter'"
    )
  })

  test.each([
    'someone@example.com',
    '00000000-0000-0000-0000-000000000001',
    'entra:not-a-guid',
    'github:octocat',
    'unknown'
  ])('refuses %s as updatedBy', (updatedBy) => {
    const team = alphaTeam({ updatedBy })

    expect(validators.team(team)).toContainEqual(
      expect.stringContaining('/updatedBy must match pattern')
    )
  })

  test.each([
    'entra:0f8fad5b-d9cb-469f-a165-70867728950e',
    'github:583231',
    'app:ai-platform-backend'
  ])('accepts %s as updatedBy, one identity of a known kind', (updatedBy) => {
    expect(validators.team(alphaTeam({ updatedBy }))).toEqual([])
  })

  test.each(['Alpha', 'a', 'alpha-', '1alpha', 'a'.repeat(25)])(
    'refuses the team slug %s',
    (slug) => {
      const team = alphaTeam({ team: { slug, serviceCode: 'ZZZ' } })

      expect(validators.team(team)).toContainEqual(
        expect.stringContaining('/team/slug must match pattern')
      )
    }
  )

  test('refuses a pin requested by free text', () => {
    expect(
      validators.pin(pin({ requestedBy: 'release-please' }))
    ).toContainEqual(expect.stringContaining('/requestedBy must match pattern'))
  })

  test('refuses a pin whose release is neither a tag nor a SHA', () => {
    expect(validators.pin(pin({ release: 'main' }))).toContainEqual(
      expect.stringContaining('/release must match pattern')
    )
  })

  test('requires a tag ref for an environment with autoPin', () => {
    const registry = {
      schemaVersion: 1,
      environments: [registryEntry({ refs: ['sha'] })]
    }

    expect(validators.registry(registry)).toContainEqual(
      expect.stringContaining('/environments/0/refs must contain')
    )
  })

  test('refuses a Cognito issuer for CDP', () => {
    const entry = registryEntry()
    const registry = {
      schemaVersion: 1,
      environments: [
        {
          ...entry,
          cdp: {
            ...entry.cdp,
            issuer: 'https://cognito-identity.amazonaws.com'
          }
        }
      ]
    }

    expect(validators.registry(registry)).toContainEqual(
      expect.stringContaining('/environments/0/cdp/issuer must match pattern')
    )
  })

  test('refuses a service code other than AIP', () => {
    const params = environmentParams({ service_code: 'AIE' })

    expect(validators.environment(params)).toContainEqual(
      expect.stringContaining('/service_code must be equal to constant')
    )
  })

  test('refuses a name code in the naming block', () => {
    const params = environmentParams({
      naming: { sub_type: 'SND', environment_instance: '1', name: 'X' }
    })

    expect(validators.environment(params)).toContainEqual(
      '/naming must NOT have additional properties (name)'
    )
  })
})
