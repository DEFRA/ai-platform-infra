import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LOCK_PATH = fileURLToPath(
  new URL('../../package-lock.json', import.meta.url)
)
const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'))

function parse(version) {
  return version.split('.').map(Number)
}

function isAtLeast(version, minimum) {
  const [a, b] = [parse(version), parse(minimum)]
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return true
}

describe('locked transitive dependencies', () => {
  // `npm audit --audit-level=moderate` runs in infra-checks / schemas and
  // fails on fast-uri 3.0.0 - 3.1.8 (GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h,
  // GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp). ajv only asks for ^3.0.1.
  it('locks fast-uri at 3.1.9 or later, past the moderate advisories', () => {
    const { version } = lock.packages['node_modules/fast-uri']
    expect(isAtLeast(version, '3.1.9')).toBe(true)
  })
})
