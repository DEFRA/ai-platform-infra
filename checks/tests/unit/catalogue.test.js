import {
  capacityPolicyFor,
  checkCatalogue,
  loadCatalogue,
  skusForTier
} from '../../src/catalogue.js'
import { loadValidators } from '../../src/schemas.js'
import { INFRA_DIR } from '../fixtures/gitops-files.js'

const validators = loadValidators(INFRA_DIR)

function catalogueWith(changes) {
  const catalogue = loadCatalogue(INFRA_DIR)

  return {
    providers: catalogue.providers,
    models: catalogue.models.map(({ name, document }) =>
      name === 'gpt-5-nano.json'
        ? { name, document: { ...document, ...changes } }
        : { name, document }
    )
  }
}

function teamModel(changes = {}) {
  const model = loadCatalogue(INFRA_DIR).models.find(
    ({ name }) => name === 'gpt-5-nano.json'
  ).document

  return { ...model, ...changes }
}

describe('checkCatalogue', () => {
  test('accepts the catalogue in this repository', () => {
    expect(checkCatalogue(loadCatalogue(INFRA_DIR), validators)).toEqual([])
  })

  test('refuses a Global SKU for the team tier (D03)', () => {
    const model = teamModel()
    const skus = model.skus.map((sku) =>
      sku.tiers?.includes('team') ? { ...sku, name: 'GlobalStandard' } : sku
    )

    expect(checkCatalogue(catalogueWith({ skus }), validators)).toContain(
      'gpt-5-nano.json: GlobalStandard is a Global type, excluded by D03'
    )
  })

  test('refuses Standard in uksouth outside the uk data zone', () => {
    const skus = [
      ...teamModel().skus,
      {
        name: 'Standard',
        tiers: ['team'],
        regions: ['uksouth'],
        dataZone: 'eu'
      }
    ]

    expect(checkCatalogue(catalogueWith({ skus }), validators)).toContain(
      'gpt-5-nano.json: Standard in uksouth processes data in the uk zone'
    )
  })

  test('refuses a maximum above the environment quota', () => {
    const capacityPolicy = {
      min: 1,
      max: 50,
      default: 5,
      environments: { infradev: { max: 11, quota: 10 } }
    }

    expect(
      checkCatalogue(catalogueWith({ capacityPolicy }), validators)
    ).toContain('gpt-5-nano.json: infradev max exceeds the environment quota')
  })

  test('refuses an environment override that puts the default out of range', () => {
    const capacityPolicy = {
      min: 1,
      max: 50,
      default: 5,
      environments: { infradev: { max: 3, quota: 10 } }
    }

    expect(
      checkCatalogue(catalogueWith({ capacityPolicy }), validators)
    ).toContain(
      'gpt-5-nano.json: capacityPolicy for infradev needs min <= default <= max'
    )
  })

  test('refuses a model whose offering does not exist', () => {
    expect(
      checkCatalogue(
        catalogueWith({ offering: 'no-such-offering' }),
        validators
      )
    ).toContain(
      'gpt-5-nano.json: offering openai/no-such-offering does not exist'
    )
  })

  test('refuses a blocked provider', () => {
    expect(
      checkCatalogue(catalogueWith({ family: 'deepseek-r1' }), validators)
    ).toContain('gpt-5-nano.json: provider is blocked by D03')
  })

  test('refuses a duplicate offering id in a provider', () => {
    const catalogue = loadCatalogue(INFRA_DIR)
    const provider = catalogue.providers[0]
    const offerings = [
      ...provider.document.offerings,
      provider.document.offerings[0]
    ]
    const problems = checkCatalogue(
      {
        ...catalogue,
        providers: [
          { ...provider, document: { ...provider.document, offerings } }
        ]
      },
      validators
    )

    expect(problems).toContain(
      'openai.json: offering azure-openai is listed twice'
    )
  })
})

describe('skusForTier', () => {
  test('treats a SKU without tiers as Research only', () => {
    const model = {
      skus: [
        { name: 'GlobalStandard' },
        { name: 'DataZoneStandard', tiers: ['team'] }
      ]
    }

    expect(skusForTier(model, 'research').map((s) => s.name)).toEqual([
      'GlobalStandard'
    ])
    expect(skusForTier(model, 'team').map((s) => s.name)).toEqual([
      'DataZoneStandard'
    ])
  })

  test('offers a SKU to every tier it names: Infradev research shares the team SKU', () => {
    const model = teamModel()

    expect(skusForTier(model, 'research').map((s) => s.name)).toEqual([
      'GlobalStandard',
      'DataZoneStandard'
    ])
    expect(skusForTier(model, 'team').map((s) => s.name)).toEqual([
      'DataZoneStandard'
    ])
  })
})

describe('capacityPolicyFor', () => {
  test('applies the environment override over the base policy', () => {
    expect(capacityPolicyFor(teamModel(), 'infradev')).toEqual({
      min: 1,
      max: 5,
      default: 1,
      quota: 10
    })
  })

  test('falls back to the base policy without an override', () => {
    expect(capacityPolicyFor(teamModel(), 'dev')).toEqual({
      min: 1,
      max: 50,
      default: 5
    })
  })
})
