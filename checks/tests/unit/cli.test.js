import { execFileSync } from 'node:child_process'
import {
  cpSync,
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
  betaTeam,
  pin,
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

  describe('notices', () => {
    function environmentsWithoutTeamRegistrations() {
      const environments = join(scratch, 'environments-no-registrations')
      cpSync(ENVIRONMENTS_DIR, environments, { recursive: true })
      const path = join(environments, 'registry.json')
      const registry = JSON.parse(readFileSync(path, 'utf8'))
      registry.environments[0].entra.teamRegistrations = false
      writeFileSync(path, JSON.stringify(registry))

      return environments
    }

    function tenantsArgs(repository, base, head, environments) {
      return [
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
        environments,
        '--author',
        'ai-platform-orchestrator[bot]',
        '--operation-id',
        betaTeam().operationId
      ]
    }

    test.each([
      [
        'prints it as a line',
        'false',
        'environments/infradev/beta.json: notice: registration not enabled in infradev: 1 federation of beta is accepted but not applied\n'
      ],
      [
        'prints it as an annotation inside Actions',
        'true',
        '::notice file=environments/infradev/beta.json::registration not enabled in infradev: 1 federation of beta is accepted but not applied\n'
      ]
    ])(
      'a federation with registrations off %s and still passes',
      (_, actions, line) => {
        vi.stubEnv('GITHUB_ACTIONS', actions)
        const repository = createRepository()

        try {
          const base = repository.commit('chore: initialise')
          repository.write(teamPath(betaTeam()), serialise(betaTeam()))
          const head = repository.commit('chore: beta')
          const io = capture()

          expect(
            run(
              tenantsArgs(
                repository,
                base,
                head,
                environmentsWithoutTeamRegistrations()
              ),
              io
            )
          ).toBe(0)
          expect(io.out).toBe(line)
        } finally {
          repository.destroy()
        }
      }
    )

    test('prints no notice where registrations are enabled', () => {
      const repository = createRepository()

      try {
        const base = repository.commit('chore: initialise')
        repository.write(teamPath(betaTeam()), serialise(betaTeam()))
        const head = repository.commit('chore: beta')
        const io = capture()

        expect(
          run(tenantsArgs(repository, base, head, ENVIRONMENTS_DIR), io)
        ).toBe(0)
        expect(io.out).toBe('')
      } finally {
        repository.destroy()
      }
    })

    test('puts the notices of the applied commit in the run report', () => {
      const repository = createRepository()

      try {
        repository.write(teamPath(betaTeam()), serialise(betaTeam()))
        const head = repository.commit('chore: beta')
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
              'tenants',
              '--environments',
              environmentsWithoutTeamRegistrations(),
              '--outcome',
              'success',
              '--out',
              out
            ],
            capture()
          )
        ).toBe(0)
        expect(JSON.parse(readFileSync(out, 'utf8')).notices).toEqual([
          {
            code: 'registration-not-enabled',
            file: 'environments/infradev/beta.json',
            team: 'beta',
            message:
              'registration not enabled in infradev: 1 federation of beta is accepted but not applied'
          }
        ])
      } finally {
        repository.destroy()
      }
    })
  })

  describe('the pin commands', () => {
    const PIN_PATH = 'environments/infradev/platform.json'

    function pinsRepository() {
      const repository = createRepository()
      const base = repository.commit('chore: initialise')

      return { repository, base }
    }

    function stateArgs(repository, extra) {
      return [
        '--repo',
        repository.dir,
        '--infra',
        INFRA_DIR,
        '--environments',
        ENVIRONMENTS_DIR,
        ...extra
      ]
    }

    test.each(['pins', 'pin-on-main'])(
      '%s exits 2 without its options',
      (command) => {
        const io = capture()

        expect(run([command], io)).toBe(2)
        expect(io.err).toMatch(new RegExp(`^${command}: missing --`))
      }
    )

    test('refuses a pin change from someone who is not a registry writer', () => {
      const { repository, base } = pinsRepository()

      try {
        repository.write(PIN_PATH, serialise(pin()))
        const head = repository.commit('chore: pin infradev')
        const io = capture()

        expect(
          run(
            [
              'pins',
              ...stateArgs(repository, [
                '--base',
                base,
                '--head',
                head,
                '--author',
                'someone',
                '--infra-remote',
                repository.dir
              ])
            ],
            io
          )
        ).toBe(1)
        expect(io.out).toContain('only a registry writer App')
      } finally {
        repository.destroy()
      }
    })

    test('pin-on-main refuses an environment with no pin', () => {
      const { repository, base } = pinsRepository()

      try {
        const io = capture()

        expect(
          run(
            [
              'pin-on-main',
              ...stateArgs(repository, [
                '--ref',
                base,
                '--environment',
                'infradev',
                '--infra-remote',
                repository.dir
              ])
            ],
            io
          )
        ).toBe(1)
        expect(io.out).toBe(`${PIN_PATH}: no pin exists for this environment\n`)
      } finally {
        repository.destroy()
      }
    })
  })

  describe('plan-guard', () => {
    const plan = (teams) => ({
      resource_changes: teams.map((team) => ({
        address: `module.team["${team}"].x.this`,
        change: { actions: ['delete'] }
      }))
    })

    function guard(teams, extra = []) {
      const repository = createRepository()

      try {
        const head = repository.commit('chore: initialise')
        const file = join(scratch, 'plan.json')
        writeFileSync(file, JSON.stringify(plan(teams)))
        const io = capture()
        const code = run(
          [
            'plan-guard',
            '--plan',
            file,
            '--state',
            'tenants',
            '--repo',
            repository.dir,
            '--head',
            head,
            '--environment',
            'infradev',
            ...extra
          ],
          io
        )

        return { code, out: io.out }
      } finally {
        repository.destroy()
      }
    }

    test('refuses destroys that span more than one team, and each destroy', () => {
      const { code, out } = guard(['alpha', 'beta'])

      expect(code).toBe(1)
      expect(out).toContain(
        'refused: destroys span 2 teams (alpha, beta); one team per apply unless an engineer dispatches allow_destroy\n'
      )
      expect(out).toContain('refused: delete module.team["alpha"].x.this\n')
    })

    test('allows them when an engineer dispatches allow_destroy', () => {
      const { code, out } = guard(['alpha', 'beta'], ['--allow-destroy'])

      expect(code).toBe(0)
      expect(out).toContain('allowed by allow_destroy: destroys span 2 teams')
      expect(out).toContain(
        'allowed by allow_destroy: delete module.team["beta"].x.this\n'
      )
    })

    test('refuses a destroy the merged diff does not explain, and needs --base for none', () => {
      const { code, out } = guard(['alpha'], ['--base', ''])

      expect(code).toBe(1)
      expect(out).toBe('refused: delete module.team["alpha"].x.this\n')
    })
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
