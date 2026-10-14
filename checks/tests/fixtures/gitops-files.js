import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { canonicalJson } from '../../src/canonical-json.js'

const INFRA_DIR = join(import.meta.dirname, '..', '..', '..')
const EXAMPLES_DIR = join(INFRA_DIR, 'examples')
const ENVIRONMENTS_DIR = join(EXAMPLES_DIR, 'ai-platform-environments')

function example(path) {
  return JSON.parse(readFileSync(join(EXAMPLES_DIR, path), 'utf8'))
}

/**
 * Key team `alpha` from examples/, which the schema tests prove valid.
 *
 * @param {object} [overrides] - Top-level fields to replace.
 * @returns {object} A new team document.
 */
function keyTeam(overrides = {}) {
  return {
    ...example('ai-platform-tenants/environments/infradev/alpha.json'),
    ...overrides
  }
}

/**
 * OAuth team `beta` from examples/.
 *
 * @param {object} [overrides] - Top-level fields to replace.
 * @returns {object} A new team document.
 */
function oauthTeam(overrides = {}) {
  return {
    ...example('ai-platform-tenants/environments/infradev/beta.json'),
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
 * overlaid by the environment's own, as Terraform reads them.
 *
 * @param {object} [overrides] - Top-level fields to replace.
 * @returns {object} A new effective parameters document.
 */
function environmentParams(overrides = {}) {
  return {
    ...globalParams(),
    ...example(
      'ai-platform-environments/environments/infradev/platform.tfvars.json'
    ),
    ...overrides
  }
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
  keyTeam,
  oauthTeam,
  pin,
  registryEntry,
  teamPath
}
