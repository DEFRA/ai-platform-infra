import { canonicalJson, isCanonical } from '../../src/canonical-json.js'

describe('canonicalJson', () => {
  test('sorts keys at every level and keeps array order', () => {
    const text = canonicalJson({ b: [{ z: 1, a: 2 }, 3], a: null })

    expect(text).toBe(
      '{\n  "a": null,\n  "b": [\n    {\n      "a": 2,\n      "z": 1\n' +
        '    },\n    3\n  ]\n}\n'
    )
  })

  test('produces identical bytes for documents with keys in any order', () => {
    expect(canonicalJson({ x: 1, y: { q: 2, p: 3 } })).toBe(
      canonicalJson({ y: { p: 3, q: 2 }, x: 1 })
    )
  })
})

describe('isCanonical', () => {
  test('accepts text that canonicalJson produced', () => {
    expect(isCanonical(canonicalJson({ b: 1, a: 2 }))).toBe(true)
  })

  test('rejects unsorted keys', () => {
    expect(isCanonical('{\n  "b": 1,\n  "a": 2\n}\n')).toBe(false)
  })

  test('rejects CRLF line endings', () => {
    expect(isCanonical('{\r\n  "a": 1\r\n}\r\n')).toBe(false)
  })

  test('rejects a missing trailing newline', () => {
    expect(isCanonical('{\n  "a": 1\n}')).toBe(false)
  })

  test('rejects text that is not JSON', () => {
    expect(isCanonical('{ a: 1 }')).toBe(false)
  })
})
