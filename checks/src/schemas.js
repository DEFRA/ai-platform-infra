import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const CONTRACT_SCHEMAS = ['team', 'pin', 'registry', 'environment']
const CATALOGUE_SCHEMAS = ['model', 'provider']

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function formatErrors(errors) {
  return (errors ?? []).map((error) => {
    const where = error.instancePath || '/'
    const extra = error.params?.additionalProperty
      ? ` (${error.params.additionalProperty})`
      : ''

    return `${where} ${error.message}${extra}`
  })
}

/**
 * Compiles the contract and catalogue schemas shipped in an
 * ai-platform-infra checkout, so every check runs the schemas of the
 * release the environment is pinned to.
 *
 * @param {string} infraDir - Root of an ai-platform-infra checkout.
 * @returns {Record<string, (document: unknown) => string[]>} One validator
 *   per schema name, each returning a list of problems (empty when valid).
 */
function loadValidators(infraDir) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false
  })
  addFormats(ajv)

  const sources = [
    ...CONTRACT_SCHEMAS.map((name) => [
      name,
      join(infraDir, 'schemas', `${name}.schema.json`)
    ]),
    ...CATALOGUE_SCHEMAS.map((name) => [
      name,
      join(infraDir, 'catalogue', 'schema', `${name}.schema.json`)
    ])
  ]

  return Object.fromEntries(
    sources.map(([name, path]) => {
      const validate = ajv.compile(readJson(path))

      return [
        name,
        (document) => (validate(document) ? [] : formatErrors(validate.errors))
      ]
    })
  )
}

export { loadValidators, readJson }
