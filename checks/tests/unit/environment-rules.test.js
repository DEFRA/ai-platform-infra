import {
  checkEnvironmentParams,
  checkRegistry,
  findPlaceholders
} from '../../src/environment-rules.js'
import { loadValidators } from '../../src/schemas.js'
import {
  environmentParams,
  INFRA_DIR,
  registryEntry
} from '../fixtures/gitops-files.js'

const validators = loadValidators(INFRA_DIR)
const FILE = 'environments/infradev/platform.tfvars.json'

function check(params, entry = registryEntry()) {
  return checkEnvironmentParams({ file: FILE, params, entry, validators }).map(
    (problem) => problem.message
  )
}

describe('checkEnvironmentParams', () => {
  test('accepts the public minimal platform in Infradev', () => {
    expect(check(environmentParams())).toEqual([])
  })

  test('refuses public-minimal in a consumer environment', () => {
    const entry = registryEntry({ name: 'dev', class: 'consumer-lower' })

    expect(check(environmentParams({ environment: 'dev' }), entry)).toContain(
      'public-minimal is allowed only in Infradev and the Sandbox until the ' +
        'gate before DEV'
    )
  })

  test('refuses public-minimal for an Infradev entry of another class', () => {
    const entry = registryEntry({ class: 'shared-service' })

    expect(check(environmentParams(), entry)).toContain(
      'public-minimal is allowed only in Infradev and the Sandbox until the ' +
        'gate before DEV'
    )
  })

  test('refuses named exceptions on the public minimal platform', () => {
    const params = environmentParams({
      named_exceptions: [{ id: 'X1', owner: 'AI Platform', ends: 'TBC' }]
    })

    expect(check(params)).toContain(
      'named exceptions apply only to the private topology'
    )
  })

  test('refuses the private topology until it is built', () => {
    const params = environmentParams({ network: { mode: 'private' } })

    expect(check(params)).toEqual(
      expect.arrayContaining([
        'the private topology is built at the gate before DEV; the platform ' +
          'root does not implement it yet',
        'the private topology needs a runner group'
      ])
    )
  })

  test('requires Premium v2 in consumer environments (D15)', () => {
    const entry = registryEntry({ name: 'dev', class: 'consumer-lower' })

    expect(check(environmentParams({ environment: 'dev' }), entry)).toContain(
      'consumer environments run PremiumV2 (D15)'
    )
  })

  test('refuses parameters for another environment', () => {
    expect(check(environmentParams({ environment: 'sandbox' }))).toContain(
      'environment must equal the registry entry'
    )
  })

  test('refuses a first Foundry region other than UK South', () => {
    const params = environmentParams({ foundry_regions: ['swedencentral'] })

    expect(check(params)).toEqual(['the first Foundry region must be uksouth'])
  })
})

describe('checkRegistry', () => {
  test('refuses an environment listed twice', () => {
    const registry = {
      schemaVersion: 1,
      environments: [registryEntry(), registryEntry()]
    }

    expect(checkRegistry(registry, validators)).toEqual([
      { file: 'registry.json', message: 'environment infradev is listed twice' }
    ])
  })
})

describe('findPlaceholders', () => {
  test('reports every example value in the example parameters', () => {
    expect(
      findPlaceholders(FILE, environmentParams()).map((p) => p.message)
    ).toEqual([
      '/apim_publisher/email is a placeholder value',
      '/identities/portal_api_principal_object_id is a placeholder value'
    ])
  })

  test('reports nothing for real-looking values', () => {
    const params = environmentParams({
      apim_publisher: { name: 'Defra AI Platform', email: 'aip@defra.gov.uk' },
      identities: {
        portal_api_principal_object_id: '6c3f7a1e-2b4d-4e8f-9a0b-1c2d3e4f5a6b'
      }
    })

    expect(findPlaceholders(FILE, params)).toEqual([])
  })
})
