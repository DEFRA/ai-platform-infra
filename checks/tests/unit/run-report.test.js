import {
  buildRunReport,
  parseFailures,
  summariseChanges,
  withoutSensitive
} from '../../src/run-report.js'
import { keyTeam, serialise, teamPath } from '../fixtures/gitops-files.js'
import { createRepository } from '../helpers/repository.js'

const ALPHA = 'module.team["alpha"]'

describe('summariseChanges', () => {
  test('counts changes in total and per team', () => {
    const plan = {
      resource_changes: [
        { address: `${ALPHA}.a.b`, change: { actions: ['create'] } },
        { address: `${ALPHA}.a.c`, change: { actions: ['delete', 'create'] } },
        { address: 'module.team["beta"].x.y', change: { actions: ['no-op'] } },
        { address: 'data.x.y', change: { actions: ['read'] } }
      ]
    }

    expect(summariseChanges(plan)).toEqual({
      total: { create: 1, update: 0, delete: 0, replace: 1 },
      teams: { alpha: { create: 1, update: 0, delete: 0, replace: 1 } }
    })
  })

  test('returns zero counts without a plan', () => {
    expect(summariseChanges(null)).toEqual({
      total: { create: 0, update: 0, delete: 0, replace: 0 },
      teams: {}
    })
  })
})

describe('parseFailures', () => {
  test('attributes diagnostics and errored hooks to teams', () => {
    const log = [
      JSON.stringify({
        type: 'diagnostic',
        diagnostic: {
          severity: 'error',
          summary: 'quota exceeded',
          address: `${ALPHA}.module.deployment["gpt-5-nano"].x.this`
        }
      }),
      JSON.stringify({
        type: 'apply_errored',
        hook: { resource: { addr: 'module.apim.x.y' }, action: 'update' }
      }),
      JSON.stringify({
        type: 'diagnostic',
        diagnostic: { severity: 'warning' }
      }),
      'not json'
    ].join('\n')

    expect(parseFailures(log)).toEqual([
      {
        address: `${ALPHA}.module.deployment["gpt-5-nano"].x.this`,
        team: 'alpha',
        summary: 'quota exceeded'
      },
      { address: 'module.apim.x.y', team: null, summary: 'update failed' }
    ])
  })
})

describe('withoutSensitive', () => {
  test('drops outputs Terraform marks sensitive', () => {
    expect(
      withoutSensitive({
        teams: { sensitive: false, value: { alpha: {} } },
        connection_string: { sensitive: true, value: 'InstrumentationKey=x' }
      })
    ).toEqual({ teams: { sensitive: false, value: { alpha: {} } } })
  })

  test('returns nothing without outputs', () => {
    expect(withoutSensitive(null)).toEqual({})
  })
})

describe('buildRunReport', () => {
  test('records operations since the last applied commit and the failing team', () => {
    const repository = createRepository()

    try {
      const base = repository.commit('chore: initialise')
      repository.write(teamPath(keyTeam()), serialise(keyTeam()))
      const head = repository.commit(
        'chore: write alpha\n\nOperation-Id: 000000000000000000000001'
      )
      const report = buildRunReport({
        repoDir: repository.dir,
        base,
        head,
        environment: 'infradev',
        state: 'tenants',
        plan: null,
        applyLog: JSON.stringify({
          type: 'diagnostic',
          diagnostic: {
            severity: 'error',
            summary: 'quota exceeded',
            address: `${ALPHA}.x.y`
          }
        }),
        outputs: null,
        outcome: 'failure',
        release: 'v0.5.0',
        run: { repository: 'DEFRA/ai-platform-tenants', id: '1', attempt: '1' }
      })

      expect(report).toMatchObject({
        appliedSha: head,
        baseSha: base,
        operations: [
          {
            sha: head,
            operationIds: ['000000000000000000000001'],
            traceparent: null
          }
        ],
        failingTeams: ['alpha'],
        unattributedFailure: false,
        outcome: 'failure'
      })
    } finally {
      repository.destroy()
    }
  })
})
