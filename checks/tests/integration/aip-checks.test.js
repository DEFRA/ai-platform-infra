import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { INFRA_DIR } from '../fixtures/gitops-files.js'

const BIN = join(import.meta.dirname, '..', '..', 'bin', 'aip-checks.js')

function aipChecks(...args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: 'false' }
  })
}

describe('aip-checks', () => {
  test('exits 0 for the catalogue in this repository', () => {
    const result = aipChecks('catalogue', '--infra', INFRA_DIR)

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  test('exits 2 with usage for no command', () => {
    const result = aipChecks()

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('usage: aip-checks')
  })
})
