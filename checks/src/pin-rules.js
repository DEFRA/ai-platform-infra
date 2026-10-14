import { isCanonical } from './canonical-json.js'

const PIN_PATH = /^environments\/([a-z][a-z0-9]{1,15})\/platform\.json$/
const TAG = /^v\d+\.\d+\.\d+$/

function problem(file, message) {
  return { file, message }
}

/**
 * Validates one platform pin: path, serialisation, schema, the registry's
 * ref kinds, that a tag resolves to the pinned SHA, and that the ledger
 * stays linear through previousRelease.
 *
 * @param {object} input - The pin and its context.
 * @param {string} input.path - Repository-relative path.
 * @param {string} input.text - File contents at the head commit.
 * @param {string | null} [input.previousText] - Contents at the base
 *   commit; null when the pin is new, omitted to skip the ledger check.
 * @param {object} input.entry - The environment's registry entry.
 * @param {Record<string, Function>} input.validators - Schema validators.
 * @param {(tag: string) => string | null} input.resolveTag - Resolves an
 *   ai-platform-infra tag to its commit SHA.
 * @param {string} [input.operationId] - Operation the change belongs to.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function checkPin(input) {
  const { path, text, previousText, entry, validators, resolveTag } = input
  const match = PIN_PATH.exec(path)

  if (!match) {
    return [problem(path, 'pins live at environments/{env}/platform.json')]
  }

  if (!isCanonical(text)) {
    return [problem(path, 'pin is not in canonical serialisation')]
  }

  const pin = JSON.parse(text)
  const schemaProblems = validators.pin(pin)

  if (schemaProblems.length > 0) {
    return schemaProblems.map((message) => problem(path, message))
  }

  const problems = []

  if (pin.environment !== match[1] || match[1] !== entry.name) {
    problems.push(problem(path, 'environment must equal the folder and entry'))
  }

  if (input.operationId && pin.operationId !== input.operationId) {
    problems.push(problem(path, `operationId must be ${input.operationId}`))
  }

  if (TAG.test(pin.release)) {
    if (!entry.refs.includes('tag')) {
      problems.push(problem(path, `${entry.name} does not accept tag pins`))
    }

    const resolved = resolveTag(pin.release)
    if (resolved !== pin.sha) {
      problems.push(
        problem(path, `${pin.release} resolves to ${resolved ?? 'nothing'}`)
      )
    }
  } else {
    if (!entry.refs.includes('sha')) {
      problems.push(problem(path, `${entry.name} accepts release tags only`))
    }

    if (pin.release !== pin.sha) {
      problems.push(problem(path, 'a SHA pin repeats the SHA as release'))
    }
  }

  if (previousText !== undefined) {
    const previous = previousText ? JSON.parse(previousText) : null
    const expectedPrevious = previous?.release ?? null

    if (pin.previousRelease !== expectedPrevious) {
      problems.push(
        problem(path, `previousRelease must be ${expectedPrevious ?? 'null'}`)
      )
    }
  }

  return problems
}

export { checkPin }
