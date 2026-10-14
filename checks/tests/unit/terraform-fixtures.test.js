import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readEnvironmentConfig } from '../../src/environment-config.js'
import { ENVIRONMENTS_DIR, INFRA_DIR } from '../fixtures/gitops-files.js'

function fixture(path) {
  return JSON.parse(readFileSync(join(INFRA_DIR, path), 'utf8'))
}

// The Terraform tests read the parameters aip-checks params writes; these
// keep their copies equal to the merged examples, so the two never drift.
describe('the Terraform tests use the merged example parameters', () => {
  const { $schema, ...merged } = readEnvironmentConfig(
    ENVIRONMENTS_DIR,
    'infradev'
  )

  test('names and bootstrap read exactly what aip-checks params writes', () => {
    expect(fixture('names/tests/params.tfvars.json')).toEqual(merged)
  })

  test('the existing resource group case differs in that one value', () => {
    expect(
      fixture('bootstrap/tests/params-existing-resource-group.tfvars.json')
    ).toEqual({
      ...merged,
      azure: { ...merged.azure, existing_resource_group: 'SNDAIEAIPRGP1401' }
    })
  })
})
