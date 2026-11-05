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

// The Jwt type and context.LastError members a policy expression may read
// (same page, checked 4 November 2026).
const ALLOWED_JWT_MEMBERS = new Set([
  'Algorithm',
  'Audiences',
  'Claims',
  'ExpirationTime',
  'Id',
  'IssuedAt',
  'Issuer',
  'NotBefore',
  'Subject',
  'Type'
])

const ALLOWED_LAST_ERROR_MEMBERS = new Set([
  'Message',
  'Path',
  'PolicyId',
  'Reason',
  'Scope',
  'Section',
  'Source'
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

  test('the gateway policy reads only Jwt members that API Management allows', () => {
    const unknown = files.flatMap(({ name, source }) =>
      [...source.matchAll(/\bjwt\.(\w+)/g)]
        .filter(([, member]) => !ALLOWED_JWT_MEMBERS.has(member))
        .map(([, member]) => `${name}: jwt.${member}`)
    )

    expect(unknown).toEqual([])
  })

  test('the gateway policy checks the token through the Jwt members design E verify 11 names', () => {
    const authorise = files.find(
      ({ name }) =>
        name.replaceAll('\\', '/') === 'modules/apim/policies/aip-authorise.xml'
    )

    for (const member of [
      'Algorithm',
      'IssuedAt',
      'ExpirationTime',
      'Claims'
    ]) {
      expect(authorise.source).toContain(`jwt.${member}`)
    }
  })

  test('the gateway policy reads only LastError members that API Management allows', () => {
    const unknown = files.flatMap(({ name, source }) =>
      [...source.matchAll(/\bcontext\.LastError\??\.(\w+)/g)]
        .filter(([, member]) => !ALLOWED_LAST_ERROR_MEMBERS.has(member))
        .map(([, member]) => `${name}: context.LastError.${member}`)
    )

    expect(unknown).toEqual([])
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
