import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { INFRA_DIR } from '../fixtures/gitops-files.js'

// Terraform's own test runner cannot see a lifecycle block, so the replacement
// order of the global layer's fragment is pinned here. The generic checks
// (aip-authorise-v2) replace the live fragment (aip-authorise), which the old
// global policy still includes. The new fragment must exist and the global
// policy must switch to it before the old one is deleted, so the team checks
// are never removed while the gate that replaces them is missing
// (review finding on infra PR 42, aip-authorise.xml:83).
const apimMain = readFileSync(
  join(INFRA_DIR, 'modules', 'apim', 'main.tf'),
  'utf8'
)

function resourceBlock(source, type, name) {
  const start = source.indexOf(`resource "${type}" "${name}" {`)
  if (start === -1) return ''
  const end = source.indexOf('\n}\n', start)
  return source.slice(start, end === -1 ? undefined : end + 2)
}

describe('the global layer fragment is replaced before the old one is deleted', () => {
  const authorise = resourceBlock(
    apimMain,
    'azurerm_api_management_policy_fragment',
    'authorise'
  )

  test('the scan finds the fragment resource', () => {
    expect(authorise).toContain('var.names.fragments.authorise')
  })

  test('the fragment is created before the one it replaces is destroyed', () => {
    expect(authorise).toMatch(
      /lifecycle\s*{[^}]*create_before_destroy\s*=\s*true/
    )
  })

  test('the global policy takes the fragment name from the resource, so it switches only once the new fragment exists', () => {
    const global = resourceBlock(
      apimMain,
      'azurerm_api_management_policy',
      'global'
    )

    expect(global).toContain(
      'authorise_fragment = azurerm_api_management_policy_fragment.authorise.name'
    )
  })
})
