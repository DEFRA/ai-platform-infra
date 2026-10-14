import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { run, tagResolver } from '../../src/cli.js'
import {
  ENVIRONMENTS_DIR,
  INFRA_DIR,
  alphaTeam,
  serialise,
  teamPath
} from '../fixtures/gitops-files.js'
import { createRepository } from '../helpers/repository.js'

function capture() {
  const io = { out: '', err: '' }

  io.stdout = { write: (text) => (io.out += text) }
  io.stderr = { write: (text) => (io.err += text) }

  return io
}

let scratch

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'aip-cli-'))
  vi.stubEnv('GITHUB_ACTIONS', 'false')
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('run', () => {
  test('prints usage and exits 2 for an unknown command', () => {
    const io = capture()

    expect(run(['nonsense'], io)).toBe(2)
    expect(io.err).toContain('usage: aip-checks <catalogue|')
  })

  test('exits 2 when a required option is missing', () => {
    const io = capture()

    expect(run(['catalogue'], io)).toBe(2)
    expect(io.err).toBe('catalogue: missing --infra\n')
  })

  test('exits 0 for a valid catalogue', () => {
    expect(run(['catalogue', '--infra', INFRA_DIR], capture())).toBe(0)
  })

  test('writes the deep-merged parameters of one environment for Terraform', () => {
    const out = join(scratch, 'params.tfvars.json')

    expect(
      run(
        [
          'params',
          '--infra',
          INFRA_DIR,
          '--environments',
          ENVIRONMENTS_DIR,
          '--environment',
          'infradev',
          '--out',
          out
        ],
        capture()
      )
    ).toBe(0)

    const params = JSON.parse(readFileSync(out, 'utf8'))
    expect(params).toMatchObject({
      environment: 'infradev',
      service_code: 'AIP',
      azure: {
        location: 'uksouth',
        apim: { sku: 'Developer', publisher: { name: 'Defra AI Platform' } },
        foundry: { regions: ['uksouth', 'swedencentral'] }
      }
    })
    expect(params).not.toHaveProperty('$schema')
  })

  test('writes no parameters that fail the schema', () => {
    const environments = join(scratch, 'environments-repo')
    const out = join(scratch, 'params.tfvars.json')
    mkdirSync(join(environments, 'environments', 'infradev'), {
      recursive: true
    })
    writeFileSync(join(environments, 'global.tfvars.json'), '{}')
    writeFileSync(
      join(environments, 'environments', 'infradev', 'platform.tfvars.json'),
      '{"environment":"infradev"}'
    )
    const io = capture()

    expect(
      run(
        [
          'params',
          '--infra',
          INFRA_DIR,
          '--environments',
          environments,
          '--environment',
          'infradev',
          '--out',
          out
        ],
        io
      )
    ).toBe(1)
    expect(io.out).toContain("must have required property 'azure'")
    expect(existsSync(out)).toBe(false)
  })

  test('prints GitHub annotations inside Actions', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    const io = capture()

    const code = run(
      [
        'environments',
        '--infra',
        INFRA_DIR,
        '--environments',
        ENVIRONMENTS_DIR,
        '--reject-placeholders'
      ],
      io
    )

    expect(code).toBe(1)
    expect(io.out).toContain(
      '::error file=global.tfvars.json::' +
        '/azure/apim/publisher/email is a placeholder value'
    )
  })

  test('validates a tenants change between two commits', () => {
    const repository = createRepository()

    try {
      const base = repository.commit('chore: initialise')
      repository.write(teamPath(alphaTeam()), serialise(alphaTeam()))
      const head = repository.commit('chore: alpha')
      const io = capture()

      expect(
        run(
          [
            'tenants',
            '--repo',
            repository.dir,
            '--base',
            base,
            '--head',
            head,
            '--infra',
            INFRA_DIR,
            '--environments',
            ENVIRONMENTS_DIR,
            '--author',
            'someone'
          ],
          io
        )
      ).toBe(1)
      expect(io.out).toContain('only a registry writer App')
    } finally {
      repository.destroy()
    }
  })

  test('refuses an unexplained delete in plan-guard', () => {
    const plan = join(scratch, 'plan.json')
    writeFileSync(
      plan,
      JSON.stringify({
        resource_changes: [
          { address: 'module.apim.x.this', change: { actions: ['delete'] } }
        ]
      })
    )
    const io = capture()

    expect(run(['plan-guard', '--plan', plan, '--state', 'platform'], io)).toBe(
      1
    )
    expect(io.out).toBe('refused: delete module.apim.x.this\n')
  })

  test('writes a canonical run report', () => {
    const repository = createRepository()

    try {
      const head = repository.commit('chore: initialise')
      const out = join(scratch, 'report.json')

      expect(
        run(
          [
            'run-report',
            '--repo',
            repository.dir,
            '--head',
            head,
            '--environment',
            'infradev',
            '--state',
            'platform',
            '--outcome',
            'success',
            '--out',
            out
          ],
          capture()
        )
      ).toBe(0)
      expect(JSON.parse(readFileSync(out, 'utf8'))).toMatchObject({
        appliedSha: head,
        state: 'platform',
        outcome: 'success'
      })
    } finally {
      repository.destroy()
    }
  })

  test('prints a document in canonical form', () => {
    const file = join(scratch, 'doc.json')
    writeFileSync(file, '{"b":1,"a":2}')
    const io = capture()

    expect(run(['canonical', '--file', file], io)).toBe(0)
    expect(io.out).toBe('{\n  "a": 2,\n  "b": 1\n}\n')
  })
})

describe('tagResolver', () => {
  test('resolves an annotated tag to its commit', () => {
    const repository = createRepository()

    try {
      const sha = repository.commit('chore: release')
      execFileSync('git', ['tag', '-a', 'v1.2.3', '-m', 'v1.2.3'], {
        cwd: repository.dir
      })

      expect(tagResolver(repository.dir)('v1.2.3')).toBe(sha)
      expect(tagResolver(repository.dir)('v9.9.9')).toBeNull()
    } finally {
      repository.destroy()
    }
  })
})
