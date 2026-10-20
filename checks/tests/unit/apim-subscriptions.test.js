import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { INFRA_DIR } from '../fixtures/gitops-files.js'

const IGNORED = /(^|[\\/])(\.terraform|tests|node_modules)([\\/]|$)/

function terraformFiles() {
  return readdirSync(INFRA_DIR, { recursive: true })
    .filter((path) => path.endsWith('.tf') && !IGNORED.test(path))
    .map((path) => join(INFRA_DIR, path))
}

// API Management subscriptions are the Portal API's: one is minted per person
// through ARM against the research API. A Terraform one would fight the
// backend on every apply and put a key in state (R1.2).
describe('Terraform owns no API Management subscription', () => {
  const sources = terraformFiles().map((file) => ({
    name: relative(INFRA_DIR, file).replaceAll('\\', '/'),
    source: readFileSync(file, 'utf8')
  }))

  test('the scan finds the API Management modules', () => {
    expect(sources.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'modules/apim/main.tf',
        'modules/apim-team-api/main.tf',
        'modules/apim-subscription-role/main.tf'
      ])
    )
  })

  test('no file declares an azurerm_api_management_subscription resource', () => {
    const declared = sources
      .filter(({ source }) =>
        /^\s*(resource|data)\s+"azurerm_api_management_subscription"/m.test(
          source
        )
      )
      .map(({ name }) => name)

    expect(declared).toEqual([])
  })

  test('the platform root, not the tenants root, assigns the role to the Portal API', () => {
    const platform = sources.find(({ name }) => name === 'platform/main.tf')
    const call = /module "apim_subscription_role" \{[\s\S]*?^\}$/m.exec(
      platform.source
    )?.[0]

    expect(call).toContain('api_management_id   = module.apim.id')
    expect(call).toContain(
      'principal_object_id = var.azure.identities.portal_api_principal_object_id'
    )
    expect(
      sources.filter(
        ({ name, source }) =>
          name.startsWith('tenants/') && source.includes('apim-subscription-role')
      )
    ).toEqual([])
  })

  test('the custom role grants no policy, API or product action', () => {
    const { source } = sources.find(
      ({ name }) => name === 'modules/apim-subscription-role/main.tf'
    )
    const actions = [
      ...source.matchAll(/"(Microsoft\.ApiManagement\/[^"]+)"/g)
    ].map(([, action]) => action)

    expect(actions).toHaveLength(7)
    expect(
      actions.filter((action) => /\/(apis|policies|products)\b/.test(action))
    ).toEqual([])
    expect(actions.every((action) => !action.endsWith('*'))).toBe(true)
  })
})
