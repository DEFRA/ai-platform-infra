import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  configFiles,
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
  test('replaces a whole global key with the environment value', () => {
    write('global.tfvars.json', {
      location: 'uksouth',
      apim_publisher: { name: 'Defra AI Platform', email: 'a@defra.gov.uk' }
    })
    write('environments/infradev/platform.tfvars.json', {
      apim_publisher: { email: 'b@defra.gov.uk' }
    })

    expect(readEnvironmentConfig(dir, 'infradev')).toEqual({
      location: 'uksouth',
      apim_publisher: { email: 'b@defra.gov.uk' }
    })
  })

  test('reads only the files that exist', () => {
    write('environments/infradev/platform.tfvars.json', { environment: 'x' })

    expect(configFiles(dir, 'infradev')).toEqual([
      join(dir, 'environments', 'infradev', 'platform.tfvars.json')
    ])
    expect(readEnvironmentConfig(dir, 'infradev')).toEqual({ environment: 'x' })
  })
})
