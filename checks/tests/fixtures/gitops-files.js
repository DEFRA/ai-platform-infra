import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { canonicalJson } from '../../src/canonical-json.js'
import { deepMerge } from '../../src/environment-config.js'

const INFRA_DIR = join(import.meta.dirname, '..', '..', '..')
const EXAMPLES_DIR = join(INFRA_DIR, 'examples')
const ENVIRONMENTS_DIR = join(EXAMPLES_DIR, 'ai-platform-environments')

function example(path) {
  return JSON.parse(readFileSync(join(EXAMPLES_DIR, path), 'utf8'))
}

/**
 * Team `alpha` from examples/, which the schema tests prove valid: an OAuth
 * team that uses client secrets.
 *
 * @param {object} [overrides] - Top-level fields to replace.
 * @returns {object} A new team document.
 */
function alphaTeam(overrides = {}) {
  return {
    ...example('ai-platform-tenants/environments/infradev/alpha.json'),
    ...overrides
  }
}

/**
 * Team `beta` from examples/: an OAuth team federated from a CDP service.
 *
 * @param {object} [overrides] - Top-level fields to replace.
 * @returns {object} A new team document.
 */
function betaTeam(overrides = {}) {
  return {
    ...example('ai-platform-tenants/environments/infradev/beta.json'),
    ...overrides
  }
}

/**
 * The platform-owned research file from examples/: the one file that names a
 * subscription key, and the deployment names its callers send.
 *
 * @param {object} [overrides] - Top-level fields to replace.
 * @returns {object} A new team document.
 */
function researchTeam(overrides = {}) {
  return {
    ...example('ai-platform-tenants/environments/infradev/research.json'),
    ...overrides
  }
}

/**
 * The infradev pin from examples/.
 *
 * @param {object} [overrides] - Fields to replace.
 * @returns {object} A new pin document.
 */
function pin(overrides = {}) {
  return {
    ...example('ai-platform-deployments/environments/infradev/platform.json'),
    ...overrides
  }
}

/**
 * The infradev registry entry from examples/.
 *
 * @param {object} [overrides] - Fields to replace.
 * @returns {object} A new registry entry.
 */
function registryEntry(overrides = {}) {
  return {
    ...example('ai-platform-environments/registry.json').environments[0],
    ...overrides
  }
}

/**
 * The shared parameters from examples/ai-platform-environments.
 *
 * @returns {object} A new global parameters document.
 */
function globalParams() {
  return example('ai-platform-environments/global.tfvars.json')
}

/**
 * The effective infradev parameters from examples/: the global file
 * deep-merged with the environment's own, as aip-checks params writes them.
 *
 * @param {object} [overrides] - Fields to merge in, at any depth.
 * @returns {object} A new effective parameters document.
 */
function environmentParams(overrides = {}) {
  return [
    globalParams(),
    example(
      'ai-platform-environments/environments/infradev/platform.tfvars.json'
    ),
    overrides
  ].reduce(deepMerge, {})
}

function teamPath(document) {
  return `environments/${document.environment}/${document.team.slug}.json`
}

export {
  canonicalJson as serialise,
  ENVIRONMENTS_DIR,
  environmentParams,
  globalParams,
  INFRA_DIR,
  alphaTeam,
  betaTeam,
  pin,
  registryEntry,
  researchTeam,
  teamPath
}
