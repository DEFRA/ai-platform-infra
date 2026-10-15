import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  configFiles,
  deepMerge,
  readEnvironmentConfig
} from '../../src/environment-config.js'

let dir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aip-config-'))
  mkdirSync(join(dir, 'environments', 'infradev'), { recursive: true })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

function write(path, document) {
  writeFileSync(join(dir, path), JSON.stringify(document))
}

describe('readEnvironmentConfig', () => {
  test('merges objects at any depth, so an environment sets one value', () => {
    write('global.tfvars.json', {
      service_code: 'AIP',
      azure: {
        location: 'uksouth',
        apim: {
          publisher: { name: 'Defra AI Platform', email: 'a@defra.gov.uk' }
        },
        foundry: { regions: ['uksouth', 'swedencentral'] }
      }
    })
    write('environments/infradev/platform.tfvars.json', {
      azure: {
        apim: { sku: 'Developer', publisher: { email: 'b@defra.gov.uk' } },
        foundry: { regions: ['uksouth'] }
      }
    })

    expect(readEnvironmentConfig(dir, 'infradev')).toEqual({
      service_code: 'AIP',
      azure: {
        location: 'uksouth',
        apim: {
          sku: 'Developer',
          publisher: { name: 'Defra AI Platform', email: 'b@defra.gov.uk' }
        },
        foundry: { regions: ['uksouth'] }
      }
    })
  })

  test('replaces arrays, values and null rather than merging them', () => {
    expect(
      deepMerge(
        { a: [1, 2], b: { c: 1 }, d: 1 },
        { a: [3], b: null, d: { e: 2 } }
      )
    ).toEqual({ a: [3], b: null, d: { e: 2 } })
  })

  test('reads only the files that exist', () => {
    write('environments/infradev/platform.tfvars.json', { environment: 'x' })

    expect(configFiles(dir, 'infradev')).toEqual([
      join(dir, 'environments', 'infradev', 'platform.tfvars.json')
    ])
    expect(readEnvironmentConfig(dir, 'infradev')).toEqual({ environment: 'x' })
  })
})
