import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadMessageValidators } from '../../src/schemas.js'
import { INFRA_DIR } from '../fixtures/gitops-files.js'

const MESSAGES_DIR = join(INFRA_DIR, 'schemas', 'messages')
const EXAMPLES_DIR = join(MESSAGES_DIR, 'examples')
const validators = loadMessageValidators(INFRA_DIR)

const STATUSES = [
  'requested',
  'checks-failed',
  'committed',
  'deploying',
  'deployed',
  'deploy-failed',
  'paused',
  'resumed'
]
const OPERATION_STATES = [
  'queued',
  'requested',
  'committed',
  'deploying',
  'deployed',
  'verified',
  'active',
  'removed',
  'checks-failed',
  'deploy-failed',
  'timed-out'
]

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function exampleFiles(kind) {
  return readdirSync(EXAMPLES_DIR)
    .filter((file) => file.startsWith(`${kind}-`) && file.endsWith('.json'))
    .sort()
}

/**
 * A fresh copy of a shipped example, with fields replaced; a value of
 * `undefined` removes the field.
 *
 * @param {string} name - File name without `.json`, e.g. `event-deployed`.
 * @param {object} [overrides] - Fields to replace or remove.
 * @returns {object} The document.
 */
function example(name, overrides = {}) {
  const document = {
    ...readJson(join(EXAMPLES_DIR, `${name}.json`)),
    ...overrides
  }

  return Object.fromEntries(
    Object.entries(document).filter(([, value]) => value !== undefined)
  )
}

function without(document, ...fields) {
  return Object.fromEntries(
    Object.entries(document).filter(([key]) => !fields.includes(key))
  )
}

function expectRejected(kind, document, fragment) {
  const problems = validators[kind](document)

  expect(problems.length).toBeGreaterThan(0)
  if (fragment) {
    expect(problems.join('\n')).toContain(fragment)
  }
}

const failureReason = (code, retryable) => ({
  code,
  message: 'The reason, in a sentence.',
  retryable
})

describe('the message schemas', () => {
  test.each([
    ['command', 'aip.gitops.command/1'],
    ['event', 'aip.gitops.event/1']
  ])('%s.schema.json is draft 2020-12, closed and named', (kind, id) => {
    const schema = readJson(join(MESSAGES_DIR, `${kind}.schema.json`))

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.schema.const).toBe(id)
    expect(schema.required).toContain('schema')
  })

  test('only the two schemas and the examples sit in the directory', () => {
    expect(readdirSync(MESSAGES_DIR).sort()).toEqual([
      'command.schema.json',
      'event.schema.json',
      'examples'
    ])
  })

  test('every example file is a command or an event example', () => {
    const files = readdirSync(EXAMPLES_DIR)

    expect(files.length).toBeGreaterThan(0)
    expect(
      files.filter((file) => !/^(command|event)-[a-z0-9-]+\.json$/.test(file))
    ).toEqual([])
  })
})

describe('the examples', () => {
  test.each(exampleFiles('command'))('%s is a valid command', (file) => {
    expect(validators.command(readJson(join(EXAMPLES_DIR, file)))).toEqual([])
  })

  test.each(exampleFiles('event'))('%s is a valid event', (file) => {
    expect(validators.event(readJson(join(EXAMPLES_DIR, file)))).toEqual([])
  })

  test('an event is not a command and a command is not an event', () => {
    expectRejected('command', example('event-requested'))
    expectRejected('event', example('command-submit-write-team'))
  })

  test('commands cover every type, action and pin or team file', () => {
    const commands = exampleFiles('command').map((file) =>
      readJson(join(EXAMPLES_DIR, file))
    )

    expect(new Set(commands.map((command) => command.type))).toEqual(
      new Set(['submit', 'apply', 'reconcile'])
    )
    expect(
      new Set(commands.filter((command) => command.action).map((c) => c.action))
    ).toEqual(new Set(['write', 'remove', 'revert']))
    expect(
      commands.some((c) => c.type === 'submit' && c.expectedBase === null)
    ).toBe(true)
    expect(
      commands.some((c) => c.type === 'submit' && c.expectedBase?.length === 40)
    ).toBe(true)
    expect(
      commands.some(
        (c) => c.type === 'reconcile' && c.state === 'requested' && c.document
      )
    ).toBe(true)
    expect(
      commands.some((c) => c.type === 'reconcile' && c.state === 'deploying')
    ).toBe(true)
  })

  test('events cover every status', () => {
    const events = exampleFiles('event').map((file) =>
      readJson(join(EXAMPLES_DIR, file))
    )

    expect(new Set(events.map((event) => event.status))).toEqual(
      new Set(STATUSES)
    )
  })

  test('events cover break-glass, a run with no operation, and each retryable failure', () => {
    const events = exampleFiles('event').map((file) =>
      readJson(join(EXAMPLES_DIR, file))
    )
    const retryable = events
      .filter((event) => event.failureReason?.retryable)
      .map((event) => `${event.status}:${event.failureReason.code}`)

    expect(events.some((event) => event.action === 'break-glass')).toBe(true)
    expect(
      events.some((e) => e.action === 'apply' && e.operationId === null)
    ).toBe(true)
    expect(events.some((e) => e.source === 'reconciler')).toBe(true)
    expect(events.some((e) => e.failureReason?.retryable === false)).toBe(true)
    expect(retryable.sort()).toEqual([
      'checks-failed:commit-conflict',
      'checks-failed:paused',
      'checks-failed:stale-revision',
      'deploy-failed:paused'
    ])
  })

  test.each(exampleFiles('event'))(
    '%s has the eventId the contract defines',
    (file) => {
      const event = readJson(join(EXAMPLES_DIR, file))
      const subject = event.operationId ?? event.commitSha ?? event.environment

      expect(event.eventId).toBe(
        `${subject}:${event.status}:${event.runId}:${event.runAttempt}`
      )
    }
  )

  test.each(exampleFiles('command'))(
    '%s has a commandId that is a UUIDv7',
    (file) => {
      expect(readJson(join(EXAMPLES_DIR, file)).commandId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
    }
  )
})

describe('the event schema', () => {
  const base = () => example('event-deployed')
  const required = readJson(join(MESSAGES_DIR, 'event.schema.json')).required

  test.each(required)('requires %s', (field) => {
    expectRejected(
      'event',
      without(base(), field),
      `must have required property '${field}'`
    )
  })

  test('requires the fields §5 says are always present, nullable or not', () => {
    expect(required).toEqual(
      expect.arrayContaining([
        'schema',
        'eventId',
        'environment',
        'team',
        'path',
        'action',
        'status',
        'timestamp',
        'source',
        'requestedBy',
        'repository',
        'traceparent',
        'cdpRequestId',
        'operationId',
        'runId',
        'runAttempt',
        'runUrl'
      ])
    )
  })

  test('refuses a field the schema does not name', () => {
    expectRejected(
      'event',
      { ...base(), pullRequest: 1 },
      'must NOT have additional properties (pullRequest)'
    )
  })

  test.each(['merged', 'pr-raised', 'queued', 'verified', 'Deployed', ''])(
    'refuses %j as a status',
    (status) => {
      expectRejected('event', { ...base(), status })
    }
  )

  test.each(['abandon', 'merge', 'WRITE', ''])(
    'refuses %j as an action',
    (action) => {
      expectRejected('event', { ...base(), action })
    }
  )

  test.each(['workflow', 'worker', 'backend', ''])(
    'refuses %j as a source',
    (source) => {
      expectRejected('event', { ...base(), source })
    }
  )

  test('refuses another schema identifier or version', () => {
    expectRejected('event', { ...base(), schema: 'aip.gitops.event/2' })
    expectRejected('event', { ...base(), schema: 'aip.gitops.command/1' })
  })

  test.each([
    ['a missing runId', { runId: undefined }],
    ['a zero runAttempt', { runAttempt: 0 }],
    ['a fractional runId', { runId: 1.5 }],
    ['a string runId', { runId: '123' }],
    ['a run URL that is not a GitHub run', { runUrl: 'https://example.com/r' }],
    ['a commit SHA that is short', { commitSha: 'abc123' }],
    ['an uppercase commit SHA', { commitSha: 'A'.repeat(40) }],
    ['a timestamp that is not a date-time', { timestamp: 'yesterday' }],
    ['an environment with capitals', { environment: 'InfraDev' }],
    ['a person named by email', { requestedBy: 'someone@example.com' }],
    ['a person named by name', { requestedBy: 'Jane Smith' }],
    ['a bare object ID', { requestedBy: '0f8fad5b-d9cb-469f-a165' }],
    ['a repository without an owner', { repository: 'ai-platform-tenants' }],
    ['a traceparent that is not W3C', { traceparent: 'abc' }],
    ['an operation ID that is too short', { operationId: 'op-1' }],
    ['a path outside environments', { path: 'src/alpha.json' }],
    ['an eventId with no run', { eventId: 'op-7f3c9a1e:deployed' }],
    ['an eventId over the SQS limit', { eventId: `${'a'.repeat(129)}:x:1:1` }],
    ['an empty team', { team: '' }]
  ])('refuses %s', (_name, overrides) => {
    expectRejected('event', example('event-deployed', overrides))
  })

  test.each([
    ['traceparent', null],
    ['cdpRequestId', null]
  ])(
    'accepts a null %s: the field is always sent, the value is optional',
    (field, value) => {
      expect(
        validators.event(example('event-deployed', { [field]: value }))
      ).toEqual([])
    }
  )

  test.each([
    'entra:0f8fad5b-d9cb-469f-a165-70867728950e',
    'github:583231',
    'app:ai-platform-release'
  ])('accepts %s as requestedBy', (requestedBy) => {
    expect(
      validators.event(example('event-deployed', { requestedBy }))
    ).toEqual([])
  })

  describe('failureReason', () => {
    test.each(['checks-failed', 'deploy-failed'])(
      'is required for %s',
      (status) => {
        const name =
          status === 'checks-failed'
            ? 'event-checks-failed'
            : 'event-deploy-failed'

        expectRejected(
          'event',
          without(example(name), 'failureReason'),
          "must have required property 'failureReason'"
        )
      }
    )

    test.each(STATUSES.filter((s) => !s.endsWith('failed')))(
      'is refused for %s',
      (status) => {
        const name = `event-${status}`

        expectRejected('event', {
          ...example(name),
          failureReason: failureReason('x-y', false)
        })
      }
    )

    test.each(['code', 'message', 'retryable'])('requires %s', (field) => {
      const reason = failureReason('invalid-document', false)

      expectRejected(
        'event',
        example('event-checks-failed', {
          failureReason: without(reason, field)
        }),
        `must have required property '${field}'`
      )
    })

    test('refuses a field it does not name', () => {
      expectRejected(
        'event',
        example('event-checks-failed', {
          failureReason: { ...failureReason('invalid-document', false), by: 1 }
        })
      )
    })

    test.each(['stale-revision', 'paused', 'commit-conflict'])(
      'a checks-failed %s is retryable, and says so',
      (code) => {
        const event = (retryable) =>
          example('event-checks-failed', {
            failureReason: failureReason(code, retryable)
          })

        expect(validators.event(event(true))).toEqual([])
        expectRejected('event', event(false))
      }
    )

    test('a checks-failed with any other code is not retryable', () => {
      const event = (retryable) =>
        example('event-checks-failed', {
          failureReason: failureReason('invalid-document', retryable)
        })

      expect(validators.event(event(false))).toEqual([])
      expectRejected('event', event(true))
    })

    test('a deploy-failed is retryable only with the code paused', () => {
      const event = (code, retryable) =>
        example('event-deploy-failed', {
          failureReason: failureReason(code, retryable)
        })

      expect(validators.event(event('paused', true))).toEqual([])
      expectRejected('event', event('paused', false))
      expectRejected('event', event('stale-revision', true))
      expect(validators.event(event('apply-failed', false))).toEqual([])
    })

    test('refuses a message of more than 1000 characters or none', () => {
      const reason = (message) => ({ ...failureReason('x-y', false), message })

      expectRejected(
        'event',
        example('event-checks-failed', {
          failureReason: reason('a'.repeat(1001))
        })
      )
      expectRejected(
        'event',
        example('event-checks-failed', { failureReason: reason('') })
      )
    })
  })

  describe('commit fields', () => {
    test.each(['committed', 'deploying', 'deployed'])(
      '%s needs commitSha and committedAt',
      (status) => {
        const event = example(`event-${status}`)

        expectRejected('event', without(event, 'commitSha'))
        expectRejected('event', without(event, 'committedAt'))
      }
    )

    test.each(['requested', 'checks-failed', 'paused', 'resumed'])(
      '%s may carry neither',
      (status) => {
        const event = example(`event-${status}`)

        expect(event.commitSha).toBeUndefined()
        expect(validators.event(event)).toEqual([])
      }
    )

    test('one without the other is refused wherever it is allowed', () => {
      const event = example('event-requested')

      expectRejected('event', {
        ...event,
        commitSha: '0123456789abcdef0123456789abcdef01234567'
      })
      expectRejected('event', { ...event, committedAt: event.timestamp })
    })

    test('a requested event may carry both, from a reconciler that found the commit', () => {
      expect(
        validators.event(
          example('event-requested', {
            commitSha: '0123456789abcdef0123456789abcdef01234567',
            committedAt: '2026-10-26T12:00:00Z'
          })
        )
      ).toEqual([])
    })
  })

  describe('deployed and deploy-failed', () => {
    test.each(['appliedSha', 'resources'])('deployed needs %s', (field) => {
      expectRejected('event', without(example('event-deployed'), field))
    })

    test('deployed accepts no resources: a removal leaves none', () => {
      expect(
        validators.event(example('event-deployed', { resources: [] }))
      ).toEqual([])
    })

    test.each(['type', 'name', 'id'])('a resource needs its %s', (field) => {
      const [resource] = example('event-deployed').resources

      expectRejected(
        'event',
        example('event-deployed', { resources: [without(resource, field)] })
      )
    })

    test('a resource names nothing else', () => {
      const [resource] = example('event-deployed').resources

      expectRejected(
        'event',
        example('event-deployed', { resources: [{ ...resource, secret: 'x' }] })
      )
    })

    test.each(['failingTeams', 'attributable'])(
      'deploy-failed needs %s',
      (field) => {
        expectRejected('event', without(example('event-deploy-failed'), field))
      }
    )

    test('refuses a duplicate failing team and a team that is no slug', () => {
      expectRejected(
        'event',
        example('event-deploy-failed', { failingTeams: ['alpha', 'alpha'] })
      )
      expectRejected(
        'event',
        example('event-deploy-failed', { failingTeams: ['Alpha Team'] })
      )
    })

    test.each(['appliedSha', 'resources', 'failingTeams', 'attributable'])(
      'refuses %s on a status that is not its own',
      (field) => {
        const value = example('event-deployed', {
          failingTeams: [],
          attributable: false
        })[field]

        expectRejected('event', {
          ...example('event-committed'),
          [field]: value
        })
      }
    )
  })

  describe('operations, break-glass, pause and runs with none', () => {
    test.each(['write', 'remove', 'revert'])(
      'a %s needs an operation, a team and a path',
      (action) => {
        const event = example('event-committed', { action })

        expect(validators.event(event)).toEqual([])
        expectRejected('event', { ...event, operationId: null })
        expectRejected('event', { ...event, team: null })
        expectRejected('event', { ...event, path: null })
      }
    )

    test('an event with an operation names its team and path whatever the action', () => {
      expectRejected(
        'event',
        example('event-external-apply', {
          operationId: 'op-7f3c9a1e',
          team: null
        })
      )
      expectRejected(
        'event',
        example('event-external-apply', {
          operationId: 'op-7f3c9a1e',
          path: null
        })
      )
    })

    test('an apply with no operation has no team and no path', () => {
      const event = example('event-external-apply')

      expect(event.operationId).toBeNull()
      expect(event.team).toBeNull()
      expect(event.path).toBeNull()
      expect(validators.event(event)).toEqual([])
    })

    test('break-glass has no operation, and names the commit and the pull request', () => {
      const event = example('event-break-glass')

      expect(validators.event(event)).toEqual([])
      expectRejected('event', { ...event, operationId: 'op-7f3c9a1e' })
      expectRejected('event', without(event, 'pullRequestUrl'))
      expectRejected('event', without(event, 'commitSha'))
    })

    // Finding F4 (Copilot review of PR 31): an event with no operation may not
    // name half a target.
    test.each([
      ['break-glass', 'event-break-glass'],
      ['an apply with no operation', 'event-external-apply']
    ])(
      '%s has a team and a path together or neither, never one of them',
      (_name, file) => {
        const event = example(file)

        expect(validators.event(event)).toEqual([])
        expectRejected('event', { ...event, team: 'alpha' })
        expectRejected('event', {
          ...event,
          path: 'environments/infradev/alpha.json'
        })
        expect(
          validators.event({
            ...event,
            team: 'alpha',
            path: 'environments/infradev/alpha.json'
          })
        ).toEqual([])
      }
    )

    test('a pull request URL belongs to break-glass alone', () => {
      expectRejected('event', {
        ...example('event-committed'),
        pullRequestUrl: 'https://github.com/DEFRA/ai-platform-tenants/pull/1'
      })
    })

    test.each(['paused', 'resumed'])(
      '%s is a pause event: no operation, team or path',
      (status) => {
        const event = example(`event-${status}`)

        expect(validators.event(event)).toEqual([])
        expectRejected('event', { ...event, operationId: 'op-7f3c9a1e' })
        expectRejected('event', { ...event, action: 'write' })
        expectRejected('event', { ...event, source: 'submit' })
      }
    )

    test.each(['paused', 'resumed'])(
      '%s is for the environment alone',
      (status) => {
        const event = example(`event-${status}`)

        expectRejected('event', {
          ...event,
          team: 'alpha',
          path: 'environments/infradev/alpha.json'
        })
      }
    )

    test('the pause action carries only paused and resumed', () => {
      expectRejected('event', {
        ...example('event-committed'),
        action: 'pause'
      })
    })
  })
})

describe('the command schema', () => {
  const required = readJson(join(MESSAGES_DIR, 'command.schema.json')).required

  test.each(required)('a submit requires %s', (field) => {
    expectRejected(
      'command',
      without(example('command-submit-write-team'), field),
      `must have required property '${field}'`
    )
  })

  test.each(required)('an apply requires %s', (field) => {
    expectRejected(
      'command',
      without(example('command-apply'), field),
      `must have required property '${field}'`
    )
  })

  test('requires the fields §5 names for every command', () => {
    expect(required).toEqual(
      expect.arrayContaining([
        'schema',
        'type',
        'commandId',
        'operationId',
        'environment',
        'team',
        'repository',
        'path',
        'attempt',
        'requestedBy',
        'traceparent',
        'cdpRequestId',
        'createdAt'
      ])
    )
  })

  test('refuses a field the schema does not name', () => {
    expectRejected(
      'command',
      { ...example('command-submit-write-team'), pullRequest: true },
      'must NOT have additional properties (pullRequest)'
    )
  })

  test.each(['abandon', 'Submit', 'dispatch', ''])(
    'refuses %j as a type',
    (type) => {
      expectRejected('command', { ...example('command-apply'), type })
    }
  )

  test('refuses another schema identifier or version', () => {
    expectRejected('command', {
      ...example('command-apply'),
      schema: 'aip.gitops.command/2'
    })
    expectRejected('command', {
      ...example('command-apply'),
      schema: 'aip.gitops.event/1'
    })
  })

  test.each([
    ['a zero attempt', { attempt: 0 }],
    ['a string attempt', { attempt: '1' }],
    [
      'a UUIDv4 commandId',
      { commandId: '0f8fad5b-d9cb-469f-a165-70867728950e' }
    ],
    ['a commandId that is not a UUID', { commandId: 'abc' }],
    ['a person named by email', { requestedBy: 'someone@example.com' }],
    ['a createdAt that is not a date-time', { createdAt: 'now' }],
    ['a repository without an owner', { repository: 'ai-platform-tenants' }],
    ['a traceparent that is not W3C', { traceparent: 'abc' }],
    ['an environment with capitals', { environment: 'InfraDev' }]
  ])('refuses %s', (_name, overrides) => {
    expectRejected('command', example('command-submit-write-team', overrides))
  })

  test.each(['traceparent', 'cdpRequestId'])('accepts a null %s', (field) => {
    expect(
      validators.command(
        example('command-submit-write-team', { [field]: null })
      )
    ).toEqual([])
  })

  describe('submit', () => {
    test.each(['write', 'remove', 'revert'])('accepts %s', (action) => {
      const name = `command-submit-${action}-team`

      expect(validators.command(example(name))).toEqual([])
    })

    test.each(['abandon', 'apply', ''])('refuses %j as an action', (action) => {
      expectRejected(
        'command',
        example('command-submit-write-team', { action })
      )
    })

    test.each(['operationId', 'team', 'path', 'action', 'expectedRevision'])(
      'needs %s, and %s may not be null',
      (field) => {
        const command = example('command-submit-write-team')

        expectRejected('command', without(command, field))
        expectRejected('command', { ...command, [field]: null })
      }
    )

    test('a write carries the document, which is not empty', () => {
      const command = example('command-submit-write-team')

      expectRejected('command', without(command, 'document'))
      expectRejected('command', { ...command, document: '' })
    })

    // Finding F3 (Copilot review of PR 31): a revert restores a document, so
    // it carries one, in a submit and in a reconcile from requested.
    test.each([
      ['a submit', 'command-submit-revert-team'],
      ['a reconcile from requested', 'command-reconcile-requested']
    ])(
      '%s of a revert carries the document, which is not empty',
      (_name, file) => {
        const command = { ...example(file), action: 'revert' }

        expect(validators.command(command)).toEqual([])
        expectRejected('command', without(command, 'document'))
        expectRejected('command', { ...command, document: '' })
      }
    )

    test('a remove carries no document', () => {
      const command = example('command-submit-remove-team')

      expect(validators.command({ ...command, document: '' })).toEqual([])
      expect(validators.command(without(command, 'document'))).toEqual([])
      expectRejected('command', { ...command, document: '{}' })
    })

    test('a document is under the dispatch input limit', () => {
      expectRejected(
        'command',
        example('command-submit-write-team', { document: 'x'.repeat(65536) })
      )
    })

    test('a team file names its expected revision, 0 for a new file, never a base', () => {
      const command = example('command-submit-write-team')

      expect(validators.command({ ...command, expectedRevision: 0 })).toEqual(
        []
      )
      expectRejected('command', { ...command, expectedRevision: -1 })
      expectRejected('command', { ...command, expectedRevision: '1' })
      expectRejected('command', {
        ...command,
        expectedBase: '0123456789abcdef0123456789abcdef01234567'
      })
    })

    test.each(['platform', 'tenants'])(
      'a pin for team %s names its base blob, never a revision',
      (team) => {
        const pin = example('command-submit-write-pin', { team })

        expect(validators.command(pin)).toEqual([])
        expectRejected('command', without(pin, 'expectedBase'))
        expectRejected('command', { ...pin, expectedRevision: 1 })
        expectRejected('command', { ...pin, expectedBase: 'abc123' })
      }
    )

    test('the first pin of an environment has no base blob: null', () => {
      const pin = example('command-submit-write-first-pin')

      expect(pin.expectedBase).toBeNull()
      expect(validators.command(pin)).toEqual([])
    })

    test('refuses a team that is no slug', () => {
      expectRejected(
        'command',
        example('command-submit-write-team', { team: 'Alpha Team' })
      )
    })

    test('refuses a state: only a reconcile has one', () => {
      expectRejected(
        'command',
        example('command-submit-write-team', { state: 'requested' })
      )
    })
  })

  describe('apply', () => {
    test('is valid with no team, path or operation, as a hand or resumed apply', () => {
      const command = example('command-apply')

      expect(command.operationId).toBeNull()
      expect(validators.command(command)).toEqual([])
    })

    test('may name the operation it is for', () => {
      expect(
        validators.command(
          example('command-apply', {
            operationId: 'op-7f3c9a1e',
            team: 'alpha',
            path: 'environments/infradev/alpha.json'
          })
        )
      ).toEqual([])
    })

    // Finding F2 (Copilot review of PR 31): the target is all there or all
    // absent, so a command for an operation can always be grouped.
    test.each([
      ['an operation with no team', { operationId: 'op-7f3c9a1e' }],
      [
        'an operation with no path',
        { operationId: 'op-7f3c9a1e', team: 'alpha' }
      ],
      [
        'an operation with neither',
        { operationId: 'op-7f3c9a1e', team: null, path: null }
      ],
      ['a team with no operation', { team: 'alpha' }],
      [
        'a path with no operation',
        { path: 'environments/infradev/alpha.json' }
      ],
      [
        'a team and a path with no operation',
        { team: 'alpha', path: 'environments/infradev/alpha.json' }
      ]
    ])('refuses %s', (_name, overrides) => {
      expectRejected('command', example('command-apply', overrides))
    })

    test('refuses a half target when the operation is named too', () => {
      expectRejected(
        'command',
        example('command-apply', {
          operationId: 'op-7f3c9a1e',
          team: 'alpha',
          path: null
        })
      )
    })

    test.each([
      'action',
      'document',
      'expectedRevision',
      'expectedBase',
      'state'
    ])('carries no %s', (field) => {
      const value = field === 'expectedRevision' ? 0 : 'write'

      expectRejected('command', { ...example('command-apply'), [field]: value })
    })
  })

  describe('reconcile', () => {
    test('a reconcile from requested carries what submit needs', () => {
      const command = example('command-reconcile-requested')

      expect(validators.command(command)).toEqual([])
      expectRejected('command', without(command, 'action'))
      expectRejected('command', without(command, 'document'))
      expectRejected('command', without(command, 'expectedRevision'))
    })

    test('a reconcile from a later state needs only the state', () => {
      const command = example('command-reconcile-deploying')

      expect(command.document).toBeUndefined()
      expect(validators.command(command)).toEqual([])
      expectRejected('command', without(command, 'state'))
      expectRejected('command', { ...command, operationId: null })
    })

    test.each(OPERATION_STATES)('accepts the state %s', (state) => {
      const command =
        state === 'requested'
          ? example('command-reconcile-requested')
          : example('command-reconcile-deploying', { state })

      expect(validators.command(command)).toEqual([])
    })

    test.each(['pr-raised', 'merged', 'Requested', ''])(
      'refuses %j as a state',
      (state) => {
        expectRejected(
          'command',
          example('command-reconcile-deploying', { state })
        )
      }
    )

    test('a reconcile of a pin from requested carries its base', () => {
      const command = {
        ...example('command-submit-write-pin'),
        type: 'reconcile',
        state: 'requested'
      }

      expect(validators.command(command)).toEqual([])
      expectRejected('command', without(command, 'expectedBase'))
    })
  })
})
