import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { readJson } from './schemas.js'

const GLOBAL_FILE = 'global.tfvars.json'

/**
 * Paths of an environment's parameter files in the order Terraform reads
 * them with -var-file: global first, then the environment's own.
 *
 * @param {string} environmentsDir - ai-platform-environments checkout.
 * @param {string} environment - Environment name.
 * @returns {string[]} Existing file paths.
 */
function configFiles(environmentsDir, environment) {
  return [
    join(environmentsDir, GLOBAL_FILE),
    join(environmentsDir, 'environments', environment, 'platform.tfvars.json')
  ].filter((path) => existsSync(path))
}

/**
 * The effective parameters of an environment, with Terraform's -var-file
 * precedence: a top-level key in the environment's file replaces the
 * global one whole.
 *
 * @param {string} environmentsDir - ai-platform-environments checkout.
 * @param {string} environment - Environment name.
 * @returns {object} Effective parameters.
 */
function readEnvironmentConfig(environmentsDir, environment) {
  return Object.assign(
    {},
    ...configFiles(environmentsDir, environment).map((path) => readJson(path))
  )
}

export { configFiles, GLOBAL_FILE, readEnvironmentConfig }
