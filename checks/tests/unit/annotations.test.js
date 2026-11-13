import { errorAnnotation, noticeAnnotation } from '../../src/annotations.js'

describe('noticeAnnotation', () => {
  test('writes one notice command', () => {
    expect(
      noticeAnnotation('environments/infradev/beta.json', 'not applied')
    ).toBe('::notice file=environments/infradev/beta.json::not applied\n')
  })

  test('escapes what would inject another command', () => {
    expect(noticeAnnotation('a,b', 'x\n::error::y')).toBe(
      '::notice file=a%2Cb::x%0A::error::y\n'
    )
  })
})

describe('errorAnnotation', () => {
  test('writes one error command for a problem', () => {
    expect(
      errorAnnotation('registry.json', '/environments must be array')
    ).toBe('::error file=registry.json::/environments must be array\n')
  })

  test('escapes a file name and message that would inject another command', () => {
    expect(
      errorAnnotation(
        'environments/a,b:c/x.json',
        'bad\n::warning::injected 100%\r'
      )
    ).toBe(
      '::error file=environments/a%2Cb%3Ac/x.json::' +
        'bad%0A::warning::injected 100%25%0D\n'
    )
  })
})
