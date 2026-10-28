import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { INFRA_DIR } from '../fixtures/gitops-files.js'

const CONTRACT = readFileSync(
  join(INFRA_DIR, 'docs', 'gitops-contract.md'),
  'utf8'
)

/**
 * The cells of one row of the submit inputs table in the contract page.
 *
 * @param {string} input - The input name, such as `document`.
 * @returns {string} The row's value cell, with whitespace collapsed.
 */
function submitInputValue(input) {
  const row = CONTRACT.split('\n').find((line) =>
    line.startsWith(`| \`${input}\``)
  )
  if (!row) throw new Error(`no row for the input ${input}`)
  const [, , value] = row.split('|').map((cell) => cell.trim())
  return value.replace(/\s+/g, ' ')
}

describe('the submit inputs in the contract page match the command schema', () => {
  test('document is the whole document for write and revert, empty only for remove', () => {
    const value = submitInputValue('document')

    expect(value).toMatch(/`write`/)
    expect(value).toMatch(/`revert`/)
    expect(value).toMatch(/empty .*`remove`/)
  })

  test('expected_base is `0` for a first pin, which the command schema carries as null', () => {
    const value = submitInputValue('expected_base')

    expect(value).toMatch(/`0` for a new file/)
    expect(value).toMatch(/`expectedBase`/)
    expect(value).toMatch(/null/)
  })
})
