import {
  changedFiles,
  commitsWithTrailers,
  lastCommitFor,
  listFilesAt,
  readFileAt
} from '../../src/git.js'
import { createRepository } from '../helpers/repository.js'

let repository
let base

beforeEach(() => {
  repository = createRepository()
  repository.write('environments/infradev/alpha.json', '{}\n')
  base = repository.commit('chore: base')
})

afterEach(() => repository.destroy())

describe('changedFiles', () => {
  test('reports added, modified and deleted paths', () => {
    repository.write('environments/infradev/beta.json', '{}\n')
    repository.remove('environments/infradev/alpha.json')
    const head = repository.commit('chore: change')

    expect(changedFiles(repository.dir, base, head)).toEqual([
      { status: 'D', path: 'environments/infradev/alpha.json' },
      { status: 'A', path: 'environments/infradev/beta.json' }
    ])
  })
})

describe('readFileAt', () => {
  test('returns the contents at a commit', () => {
    expect(
      readFileAt(repository.dir, base, 'environments/infradev/alpha.json')
    ).toBe('{}\n')
  })

  test('returns null for a path missing at the commit', () => {
    expect(readFileAt(repository.dir, base, 'missing.json')).toBeNull()
  })

  test('returns null without a commit', () => {
    expect(readFileAt(repository.dir, null, 'missing.json')).toBeNull()
  })
})

describe('listFilesAt', () => {
  test('lists files under a directory', () => {
    expect(listFilesAt(repository.dir, base, 'environments/infradev')).toEqual([
      'environments/infradev/alpha.json'
    ])
  })

  test('returns nothing without a commit', () => {
    expect(listFilesAt(repository.dir, '', 'environments')).toEqual([])
  })
})

describe('lastCommitFor', () => {
  test('returns the commit that last changed the path', () => {
    repository.write('other.json', '{}\n')
    const head = repository.commit('chore: unrelated')

    expect(
      lastCommitFor(repository.dir, head, 'environments/infradev/alpha.json')
    ).toBe(base)
  })
})

describe('commitsWithTrailers', () => {
  test('returns operation IDs and trace context newest first', () => {
    repository.write('environments/infradev/alpha.json', '{"a":1}\n')
    const first = repository.commit(
      'chore: write alpha\n\nOperation-Id: op-00000001\n' +
        'Traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
    )
    repository.write('environments/infradev/alpha.json', '{"a":2}\n')
    const second = repository.commit(
      'chore: write alpha\n\nOperation-Id: op-00000002'
    )

    expect(
      commitsWithTrailers(repository.dir, base, second, 'environments/infradev')
    ).toEqual([
      { sha: second, operationIds: ['op-00000002'], traceparent: null },
      {
        sha: first,
        operationIds: ['op-00000001'],
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
      }
    ])
  })

  test('still reads the operation after text GitHub appends to a hand-merged pull request', () => {
    repository.write('environments/infradev/alpha.json', '{"a":3}\n')
    const merged = repository.commit(
      'chore(infradev): write team-aice-1 (#25)\n\n' +
        'Submitted by the AI Platform for operation `6adb1d7860b0b581ed094dfa`.\n\n' +
        'Operation-Id: 6adb1d7860b0b581ed094dfa\n' +
        'Requested-By: entra:ee43727f-77db-4154-81b6-f65c9dd900d4\n\n' +
        'Co-authored-by: ai-platform-orchestrator[bot] <333351233+ai-platform-orchestrator[bot]@users.noreply.github.com>'
    )

    expect(
      commitsWithTrailers(repository.dir, base, merged, 'environments/infradev')
    ).toEqual([
      {
        sha: merged,
        operationIds: ['6adb1d7860b0b581ed094dfa'],
        traceparent: null
      }
    ])
  })

  test('lists each operation once and ignores the subject line', () => {
    repository.write('environments/infradev/alpha.json', '{"a":4}\n')
    const head = repository.commit(
      'Operation-Id: op-subject\n\nOperation-Id: op-00000003\nOperation-Id: op-00000003'
    )

    expect(
      commitsWithTrailers(repository.dir, base, head, 'environments/infradev')
    ).toEqual([{ sha: head, operationIds: ['op-00000003'], traceparent: null }])
  })

  test('has no operation for a commit that names none', () => {
    repository.write('environments/infradev/alpha.json', '{"a":5}\n')
    const head = repository.commit('chore: manual edit')

    expect(
      commitsWithTrailers(repository.dir, base, head, 'environments/infradev')
    ).toEqual([{ sha: head, operationIds: [], traceparent: null }])
  })
})
