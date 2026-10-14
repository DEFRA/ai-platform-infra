import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { readJson } from './schemas.js'

const GLOBAL_SKU = /^Global/
const BLOCKED_PROVIDERS = /deepseek/i
const REGION_ZONES = { uksouth: 'uk', swedencentral: 'eu' }

function readDirectory(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ name, document: readJson(join(dir, name)) }))
}

/**
 * Reads catalogue/models and catalogue/providers from an infra checkout.
 *
 * @param {string} infraDir - Root of an ai-platform-infra checkout.
 * @returns {{models: Array<{name: string, document: object}>,
 *   providers: Array<{name: string, document: object}>}} Raw records.
 */
function loadCatalogue(infraDir) {
  return {
    models: readDirectory(join(infraDir, 'catalogue', 'models')),
    providers: readDirectory(join(infraDir, 'catalogue', 'providers'))
  }
}

/**
 * The SKUs a tier may deploy for a model. A SKU without `tiers` is the
 * hand-built Research deployment only.
 *
 * @param {object} model - A catalogue model record.
 * @param {string} tier - `research` or `team`.
 * @returns {object[]} Matching SKU entries.
 */
function skusForTier(model, tier) {
  return model.skus.filter((sku) => (sku.tiers ?? ['research']).includes(tier))
}

/**
 * Capacity policy for one environment, with its overrides applied.
 *
 * @param {object} model - A catalogue model record.
 * @param {string} environment - Environment name.
 * @returns {{min: number, max: number, default: number, quota?: number}}
 *   The effective policy.
 */
function capacityPolicyFor(model, environment) {
  const { environments = {}, ...base } = model.capacityPolicy

  return { ...base, ...(environments[environment] ?? {}) }
}

function checkModel(model, name, offerings, validators) {
  const problems = validators.model(model).map((p) => `${name}: ${p}`)

  if (problems.length > 0) {
    return problems
  }

  if (name !== `${model.slug}.json`) {
    problems.push(`${name}: file name must be ${model.slug}.json`)
  }

  if (!offerings.has(`${model.provider}/${model.offering}`)) {
    problems.push(
      `${name}: offering ${model.provider}/${model.offering} does not exist`
    )
  }

  if (BLOCKED_PROVIDERS.test(`${model.provider} ${model.family}`)) {
    problems.push(`${name}: provider is blocked by D03`)
  }

  const policy = model.capacityPolicy
  if (policy.min > policy.default || policy.default > policy.max) {
    problems.push(`${name}: capacityPolicy needs min <= default <= max`)
  }

  const teamSkus = skusForTier(model, 'team')

  if (model.tiers.includes('team') && teamSkus.length === 0) {
    problems.push(`${name}: the team tier needs a SKU with tiers [team]`)
  }

  if (!model.tiers.includes('team') && teamSkus.length > 0) {
    problems.push(`${name}: a team SKU needs the team tier`)
  }

  for (const sku of teamSkus) {
    if (GLOBAL_SKU.test(sku.name)) {
      problems.push(`${name}: ${sku.name} is a Global type, excluded by D03`)
    }

    if (!sku.regions || !sku.dataZone) {
      problems.push(`${name}: team SKU ${sku.name} needs regions and dataZone`)
    }

    if (sku.name === 'DataZoneStandard' && sku.dataZone !== 'eu') {
      problems.push(`${name}: DataZoneStandard processes data in the eu zone`)
    }

    for (const region of sku.regions ?? []) {
      if (!model.regions.includes(region)) {
        problems.push(`${name}: SKU region ${region} is not in regions[]`)
      }

      if (sku.name === 'Standard' && REGION_ZONES[region] !== sku.dataZone) {
        problems.push(
          `${name}: Standard in ${region} processes data in the ` +
            `${REGION_ZONES[region]} zone`
        )
      }
    }
  }

  if (model.tiers.includes('team')) {
    for (const environment of model.environments) {
      const effective = capacityPolicyFor(model, environment)

      if (effective.quota !== undefined && effective.max > effective.quota) {
        problems.push(
          `${name}: ${environment} max exceeds the environment quota`
        )
      }
    }
  }

  return problems
}

/**
 * Validates the catalogue: schemas, file names, offering references, D03
 * geography and the team-tier rules a JSON Schema cannot express.
 *
 * @param {{models: object[], providers: object[]}} catalogue - Raw records.
 * @param {Record<string, Function>} validators - From loadValidators.
 * @returns {string[]} Problems; empty when the catalogue is valid.
 */
function checkCatalogue(catalogue, validators) {
  const problems = []
  const offerings = new Set()

  for (const { name, document } of catalogue.providers) {
    const schemaProblems = validators.provider(document)
    problems.push(...schemaProblems.map((p) => `${name}: ${p}`))

    if (schemaProblems.length > 0) {
      continue
    }

    if (name !== `${document.id}.json`) {
      problems.push(`${name}: file name must be ${document.id}.json`)
    }

    const seen = new Set()
    for (const offering of document.offerings) {
      if (seen.has(offering.id)) {
        problems.push(`${name}: offering ${offering.id} is listed twice`)
      }

      seen.add(offering.id)
      offerings.add(`${document.id}/${offering.id}`)
    }
  }

  const slugs = new Set()
  for (const { name, document } of catalogue.models) {
    if (slugs.has(document.slug)) {
      problems.push(`${name}: slug ${document.slug} is not unique`)
    }

    slugs.add(document.slug)
    problems.push(...checkModel(document, name, offerings, validators))
  }

  return problems
}

/**
 * Index of catalogue models by slug.
 *
 * @param {{models: Array<{document: object}>}} catalogue - Raw records.
 * @returns {Map<string, object>} Models keyed by slug.
 */
function modelsBySlug(catalogue) {
  return new Map(
    catalogue.models.map(({ document }) => [document.slug, document])
  )
}

export {
  capacityPolicyFor,
  checkCatalogue,
  loadCatalogue,
  modelsBySlug,
  skusForTier
}
