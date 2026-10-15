import { checkPin } from '../../src/pin-rules.js'
import { loadValidators } from '../../src/schemas.js'
import {
  INFRA_DIR,
  pin,
  registryEntry,
  serialise
} from '../fixtures/gitops-files.js'

const validators = loadValidators(INFRA_DIR)
const PATH = 'environments/infradev/platform.json'
const SHA = '0000000000000000000000000000000000000000'
const OTHER_SHA = '1111111111111111111111111111111111111111'

function check(document, options = {}) {
  return checkPin({
    path: PATH,
    text: serialise(document),
    previousText: serialise(pin({ release: 'v0.3.0' })),
    entry: registryEntry(),
    validators,
    resolveTag: (tag) => (tag === 'v0.4.0' ? SHA : null),
    ...options
  }).map((problem) => problem.message)
}

describe('checkPin', () => {
  test('accepts the example pin', () => {
    expect(check(pin())).toEqual([])
  })

  test('refuses a tag that resolves to another commit', () => {
    expect(check(pin({ sha: OTHER_SHA }))).toContain(
      `v0.4.0 resolves to ${SHA}`
    )
  })

  test('refuses a tag that does not exist', () => {
    expect(check(pin({ release: 'v9.9.9' }))).toContain(
      'v9.9.9 resolves to nothing'
    )
  })

  test('refuses a SHA pin where the registry allows tags only', () => {
    const entry = registryEntry({ refs: ['tag'] })

    expect(check(pin({ release: SHA }), { entry })).toContain(
      'infradev accepts release tags only'
    )
  })

  test('refuses a SHA pin whose release is a different SHA', () => {
    expect(check(pin({ release: OTHER_SHA }))).toContain(
      'a SHA pin repeats the SHA as release'
    )
  })

  test('refuses a previousRelease that breaks the ledger', () => {
    expect(check(pin({ previousRelease: 'v0.2.0' }))).toContain(
      'previousRelease must be v0.3.0'
    )
  })

  test('requires a null previousRelease for the first pin', () => {
    expect(check(pin(), { previousText: null })).toContain(
      'previousRelease must be null'
    )
  })

  test('skips the ledger rule when no base is given', () => {
    expect(
      check(pin({ previousRelease: 'v0.1.0' }), { previousText: undefined })
    ).toEqual([])
  })

  test('refuses a pin in another environment folder', () => {
    expect(
      check(pin(), { path: 'environments/sandbox/platform.json' })
    ).toContain('environment must equal the folder and entry')
  })

  test('refuses a non-canonical pin', () => {
    expect(check(pin(), { text: JSON.stringify(pin()) })).toEqual([
      'pin is not in canonical serialisation'
    ])
  })
})
