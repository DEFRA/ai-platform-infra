import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * A throwaway git repository for tests that read commits, diffs and
 * trailers through real git.
 *
 * @returns {object} The repository and helpers to change it.
 */
function createRepository() {
  const dir = mkdtempSync(join(tmpdir(), 'aip-checks-'))

  git(dir, ['init', '--quiet', '--initial-branch=main'])
  git(dir, ['config', 'user.email', 'checks@example.invalid'])
  git(dir, ['config', 'user.name', 'checks'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
  git(dir, ['config', 'core.autocrlf', 'false'])

  return {
    dir,
    write(path, text) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    },
    remove(path) {
      rmSync(join(dir, path))
    },
    commit(message) {
      git(dir, ['add', '--all'])
      git(dir, ['commit', '--quiet', '--allow-empty', '-m', message])
      return git(dir, ['rev-parse', 'HEAD'])
    },
    destroy() {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

export { createRepository }
