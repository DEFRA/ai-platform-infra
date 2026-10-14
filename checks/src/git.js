import { execFileSync } from 'node:child_process'

const RECORD = '\u001e'
const FIELD = '\u001f'

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

/**
 * Files changed between two commits, by status.
 *
 * @param {string} cwd - Repository checkout.
 * @param {string} base - Base commit (merge base is used).
 * @param {string} head - Head commit.
 * @returns {Array<{status: string, path: string}>} One entry per path;
 *   status is A, M or D (renames are reported as D plus A).
 */
function changedFiles(cwd, base, head) {
  const output = git(cwd, [
    'diff',
    '--name-status',
    '--no-renames',
    '-z',
    `${base}...${head}`
  ])
  const parts = output.split('\0').filter(Boolean)
  const files = []

  for (let index = 0; index < parts.length; index += 2) {
    files.push({ status: parts[index][0], path: parts[index + 1] })
  }

  return files
}

/**
 * Contents of a file at a commit, or null when it does not exist there.
 *
 * @param {string} cwd - Repository checkout.
 * @param {string} ref - Commit or ref; an empty value means no commit.
 * @param {string} path - Repository-relative path.
 * @returns {string | null} File text.
 */
function readFileAt(cwd, ref, path) {
  if (!ref) {
    return null
  }

  try {
    return git(cwd, ['show', `${ref}:${path}`])
  } catch {
    return null
  }
}

/**
 * Repository-relative paths of files under a directory at a commit.
 *
 * @param {string} cwd - Repository checkout.
 * @param {string} ref - Commit; an empty value means no commit.
 * @param {string} dir - Directory, without a trailing slash.
 * @returns {string[]} Paths.
 */
function listFilesAt(cwd, ref, dir) {
  if (!ref) {
    return []
  }

  try {
    return git(cwd, ['ls-tree', '-r', '--name-only', '-z', ref, '--', dir])
      .split('\0')
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * The last commit that changed a path at or before a commit.
 *
 * @param {string} cwd - Repository checkout.
 * @param {string} ref - Commit to search back from.
 * @param {string} path - Repository-relative path.
 * @returns {string | null} Commit SHA.
 */
function lastCommitFor(cwd, ref, path) {
  const sha = git(cwd, ['log', '-1', '--format=%H', ref, '--', path]).trim()

  return sha || null
}

/**
 * Commits between two commits that touched a path, with their GitOps
 * trailers.
 *
 * @param {string} cwd - Repository checkout.
 * @param {string | null} base - Last applied commit; null for the whole
 *   history of the path.
 * @param {string} head - Commit being applied.
 * @param {string} path - Repository-relative path to filter on.
 * @returns {Array<{sha: string, operationIds: string[],
 *   traceparent: string | null}>} Newest first.
 */
function commitsWithTrailers(cwd, base, head, path) {
  const format = [
    '%H',
    '%(trailers:key=Operation-Id,valueonly,separator=%x2C)',
    '%(trailers:key=Traceparent,valueonly,separator=%x2C)'
  ].join(FIELD)
  const range = base ? `${base}..${head}` : head
  const output = git(cwd, [
    'log',
    `--format=${format}${RECORD}`,
    '-n',
    '200',
    range,
    '--',
    path
  ])

  return output
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, operations, traceparent] = record.split(FIELD)

      return {
        sha,
        operationIds: operations
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        traceparent: traceparent?.trim() || null
      }
    })
}

export {
  changedFiles,
  commitsWithTrailers,
  git,
  lastCommitFor,
  listFilesAt,
  readFileAt
}
