import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { readJson } from './schemas.js'

const GLOBAL_FILE = 'global.tfvars.json'

/**
 * Paths of an environment's parameter files in the order they merge:
 * global first, then the environment's own.
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
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Overlays one parameters document on another: objects merge key by key at
 * any depth, so an environment sets azure.apim.sku without restating the
 * rest of azure; arrays, values and null replace.
 *
 * @param {*} base - Earlier document.
 * @param {*} overlay - Later document, which wins.
 * @returns {*} A new merged document.
 */
function deepMerge(base, overlay) {
  if (!isObject(base) || !isObject(overlay)) {
    return overlay
  }

  const merged = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = Object.hasOwn(base, key) ? deepMerge(base[key], value) : value
  }

  return merged
}

/**
 * An environment's effective parameters: the global file deep-merged with
 * the environment's own. The one place parameters are merged; Terraform
 * reads the result through aip-checks params.
 *
 * @param {string} environmentsDir - ai-platform-environments checkout.
 * @param {string} environment - Environment name.
 * @returns {object} Effective parameters.
 */
function readEnvironmentConfig(environmentsDir, environment) {
  return configFiles(environmentsDir, environment)
    .map((path) => readJson(path))
    .reduce(deepMerge, {})
}

export { configFiles, deepMerge, GLOBAL_FILE, readEnvironmentConfig }
