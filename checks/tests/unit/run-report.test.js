import {
  buildRunReport,
  countEntraObjects,
  parseFailures,
  summariseChanges,
  withoutSensitive
} from '../../src/run-report.js'
import {
  alphaTeam,
  betaTeam,
  registryEntry,
  serialise,
  teamPath
} from '../fixtures/gitops-files.js'
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

describe('countEntraObjects', () => {
  test('counts the applications and service principals in every module', () => {
    const resource = (type, mode = 'managed') => ({ type, mode })

    expect(
      countEntraObjects({
        resources: [resource('azuread_application', 'data')],
        child_modules: [
          {
            resources: [resource('azurerm_api_management_api')],
            child_modules: [
              {
                resources: [
                  resource('azuread_application'),
                  resource('azuread_service_principal'),
                  resource('azuread_application_federated_identity_credential')
                ]
              }
            ]
          }
        ]
      })
    ).toBe(2)
  })

  test('counts nothing without a plan', () => {
    expect(countEntraObjects(undefined)).toBe(0)
  })
})

describe('buildRunReport', () => {
  test('records operations since the last applied commit and the failing team', () => {
    const repository = createRepository()

    try {
      const base = repository.commit('chore: initialise')
      repository.write(teamPath(alphaTeam()), serialise(alphaTeam()))
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

  describe('notices', () => {
    const { entra } = registryEntry()
    const off = registryEntry({ entra: { ...entra, teamRegistrations: false } })
    const notice = {
      code: 'registration-not-enabled',
      file: teamPath(betaTeam()),
      team: 'beta',
      message:
        'registration not enabled in infradev: 1 federation of beta is accepted but not applied'
    }

    function reportFor(documents, extra = {}) {
      const repository = createRepository()

      try {
        for (const document of documents) {
          repository.write(teamPath(document), serialise(document))
        }

        const head = repository.commit('chore: write teams')

        return buildRunReport({
          repoDir: repository.dir,
          base: null,
          head,
          environment: 'infradev',
          state: 'tenants',
          plan: null,
          applyLog: '',
          outputs: null,
          outcome: 'success',
          release: 'v0.5.0',
          run: {
            repository: 'DEFRA/ai-platform-tenants',
            id: '1',
            attempt: '1'
          },
          ...extra
        })
      } finally {
        repository.destroy()
      }
    }

    test('names a federation that waits for team registrations', () => {
      expect(
        reportFor([alphaTeam(), betaTeam()], { entry: off }).notices
      ).toEqual([notice])
    })

    test('is empty where registrations are enabled', () => {
      expect(
        reportFor([betaTeam()], { entry: registryEntry() }).notices
      ).toEqual([])
    })

    test('is empty without the registry entry', () => {
      expect(reportFor([betaTeam()]).notices).toEqual([])
    })

    test('is empty in a consumer environment, which refuses the federation', () => {
      const consumer = registryEntry({
        class: 'consumer-lower',
        entra: { ...entra, teamRegistrations: false }
      })

      expect(reportFor([betaTeam()], { entry: consumer }).notices).toEqual([])
    })

    test('is empty for a removed team, which keeps no federation', () => {
      const removed = betaTeam({ status: 'removed', oauth: undefined })

      expect(reportFor([removed], { entry: off }).notices).toEqual([])
    })

    test('is empty for the platform state', () => {
      expect(
        reportFor([betaTeam()], { entry: off, state: 'platform' }).notices
      ).toEqual([])
    })
  })

  test('treats a failure with no parsed error as unattributed', () => {
    const repository = createRepository()

    try {
      const head = repository.commit('chore: initialise')
      const report = buildRunReport({
        repoDir: repository.dir,
        base: null,
        head,
        environment: 'infradev',
        state: 'tenants',
        plan: null,
        applyLog: '',
        outputs: null,
        outcome: 'failure',
        release: 'v0.5.0',
        run: { repository: 'DEFRA/ai-platform-tenants', id: '1', attempt: '1' }
      })

      expect(report).toMatchObject({
        failingTeams: [],
        unattributedFailure: true
      })
    } finally {
      repository.destroy()
    }
  })
})
