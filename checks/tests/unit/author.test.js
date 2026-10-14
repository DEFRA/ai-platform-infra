import { checkAuthor } from '../../src/author.js'
import { registryEntry } from '../fixtures/gitops-files.js'

const entry = registryEntry()

describe('checkAuthor', () => {
  test('allows a writer App from the registry entry', () => {
    expect(
      checkAuthor({ author: 'ai-platform-orchestrator[bot]', entry })
    ).toEqual({
      allowed: true,
      writer: true,
      reason: 'ai-platform-orchestrator is a writer'
    })
  })

  test('refuses an App that is not a writer', () => {
    expect(checkAuthor({ author: 'dependabot[bot]', entry })).toMatchObject({
      allowed: false,
      reason: 'dependabot may not change infradev'
    })
  })

  test('refuses a person without the break-glass label', () => {
    const decision = checkAuthor({
      author: 'engineer',
      entry,
      approvers: ['admin-one', 'admin-two']
    })

    expect(decision.allowed).toBe(false)
  })

  test('refuses break-glass approved by the author and one other', () => {
    const decision = checkAuthor({
      author: 'engineer',
      entry,
      labels: ['break-glass'],
      approvers: ['engineer', 'admin-one']
    })

    expect(decision.allowed).toBe(false)
  })

  test('allows break-glass with two approvals from other people', () => {
    expect(
      checkAuthor({
        author: 'engineer',
        entry,
        labels: ['break-glass'],
        approvers: ['admin-one', 'admin-two']
      })
    ).toEqual({ allowed: true, writer: false, reason: 'break-glass approved' })
  })
})
