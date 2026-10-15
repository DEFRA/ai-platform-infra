import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { INFRA_DIR } from '../fixtures/gitops-files.js'

const IGNORED = /(^|[\\/])(\.terraform|tests|node_modules)([\\/]|$)/
const POLICY_TAG = 'ignore_changes = [tags["ServiceCode"]]'

function terraformFiles() {
  return readdirSync(INFRA_DIR, { recursive: true })
    .filter((path) => path.endsWith('.tf') && !IGNORED.test(path))
    .map((path) => join(INFRA_DIR, path))
}

// A resource block runs from its header to the closing brace in column 0.
function resourceBlocks(file) {
  const source = readFileSync(file, 'utf8')

  return [
    ...source.matchAll(/^resource "(\w+)" "(\w+)" \{\n[\s\S]*?^\}$/gm)
  ].map(([block, type, name]) => ({
    address: `${relative(INFRA_DIR, file)}: ${type}.${name}`,
    type,
    block
  }))
}

// Azure Policy copies the resource group's ServiceCode tag onto the
// resources inside it, so a tagged resource that does not ignore it shows a
// change on every plan that the apply and the policy then undo in turn.
describe('tagged Azure resources ignore the tag Azure Policy adds', () => {
  const tagged = terraformFiles()
    .flatMap(resourceBlocks)
    .filter(
      ({ type, block }) =>
        type.startsWith('azurerm_') &&
        type !== 'azurerm_resource_group' &&
        /^ {2}tags\s+= /m.test(block)
    )

  test('the scan finds the tagged resources', () => {
    expect(tagged.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        'azurerm_storage_account',
        'azurerm_api_management',
        'azurerm_key_vault',
        'azurerm_log_analytics_workspace',
        'azurerm_application_insights',
        'azurerm_cognitive_account'
      ])
    )
  })

  test('every one lists the ServiceCode tag in ignore_changes', () => {
    const missing = tagged
      .filter(({ block }) => !block.includes(POLICY_TAG))
      .map(({ address }) => address)

    expect(missing).toEqual([])
  })
})
