import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { INFRA_DIR } from '../fixtures/gitops-files.js'

const IGNORED = /(^|[\\/])(\.terraform|tests|node_modules)([\\/]|$)/

// What API Management allows of System.DateTime in a policy expression
// (https://learn.microsoft.com/azure/api-management/api-management-policy-expressions,
// checked 15 October 2026). Anything else, such as ToUniversalTime, makes
// APIM discard the whole policy or fragment.
const ALLOWED_DATE_TIME_MEMBERS = new Set([
  'Add',
  'AddDays',
  'AddHours',
  'AddMilliseconds',
  'AddMinutes',
  'AddMonths',
  'AddSeconds',
  'AddTicks',
  'AddYears',
  'Date',
  'Day',
  'DayOfWeek',
  'DayOfYear',
  'DaysInMonth',
  'Hour',
  'IsDaylightSavingTime',
  'IsLeapYear',
  'MaxValue',
  'Millisecond',
  'Minute',
  'MinValue',
  'Month',
  'Now',
  'Parse',
  'Second',
  'Subtract',
  'Ticks',
  'TimeOfDay',
  'Today',
  'ToString',
  'UtcNow',
  'Year'
])

function policyFiles() {
  return readdirSync(INFRA_DIR, { recursive: true })
    .filter((path) => path.endsWith('.xml') && !IGNORED.test(path))
    .map((path) => join(INFRA_DIR, path))
}

describe('policy expressions use only what API Management allows', () => {
  const files = policyFiles().map((file) => ({
    name: relative(INFRA_DIR, file),
    source: readFileSync(file, 'utf8')
  }))

  test('the scan finds the gateway policy', () => {
    expect(files.map(({ name }) => name.replaceAll('\\', '/'))).toContain(
      'modules/apim/policies/aip-authorise.xml'
    )
  })

  test('no DateTime conversion method outside the allowed list is called', () => {
    const forbidden = files.flatMap(({ name, source }) =>
      [...source.matchAll(/\.(ToUniversalTime|ToLocalTime)\(/g)].map(
        ([, member]) => `${name}: ${member}`
      )
    )

    expect(forbidden).toEqual([])
  })

  test('every static DateTime member is on the allowed list', () => {
    const unknown = files.flatMap(({ name, source }) =>
      [...source.matchAll(/\bDateTime\.(\w+)/g)]
        .filter(([, member]) => !ALLOWED_DATE_TIME_MEMBERS.has(member))
        .map(([, member]) => `${name}: DateTime.${member}`)
    )

    expect(unknown).toEqual([])
  })
})
