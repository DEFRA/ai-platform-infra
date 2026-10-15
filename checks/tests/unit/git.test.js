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
})
