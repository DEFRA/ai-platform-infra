import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { INFRA_DIR } from '../fixtures/gitops-files.js'

// Terraform's own test runner cannot see a lifecycle block or a plan against
// existing state, so the rule that keeps the platform apply free of destroys is
// pinned here. The name of an API Management policy fragment is ForceNew in
// azurerm, so a renamed fragment plans a destroy, and the apply workflow
// refuses any destroy. A fragment changes its XML in place and keeps the name it
// was released with (INF-6: v0.11.0 renamed aip-authorise to aip-authorise-v2,
// planned 1 destroy and the platform apply was refused).
const read = (...parts) => readFileSync(join(INFRA_DIR, ...parts), 'utf8')

const namingOutputs = read('modules', 'naming', 'outputs.tf')
const apimMain = read('modules', 'apim', 'main.tf')

// Every fragment name suffix released by v0.10.3 and still in use; the naming
// module builds each as "{service}-{suffix}". Add a suffix when a fragment is
// released; never edit one.
const RELEASED_FRAGMENT_SUFFIXES = [
  'authorise',
  'key-guard',
  'whoami',
  'request-model',
  'backend-foundry'
]

function fragmentsBlock(source) {
  const start = source.indexOf('output "fragments" {')
  const end = source.indexOf('\n}\n', start)
  return source.slice(start, end)
}

describe('released policy fragments keep their names', () => {
  const fragments = fragmentsBlock(namingOutputs)

  test.each(RELEASED_FRAGMENT_SUFFIXES)(
    '%s is still named {service}-%s',
    (suffix) => {
      expect(fragments).toMatch(
        new RegExp(String.raw`"\$\{local\.service\}-${suffix}"`)
      )
    }
  )

  test('no fragment name carries a version suffix', () => {
    expect(fragments).not.toMatch(/-v\d+"/)
  })
})

describe('no fragment resource is replaced to change its content', () => {
  test('the fragment resources set no create_before_destroy, which only a name change needs', () => {
    expect(apimMain).not.toContain('create_before_destroy')
  })
})
