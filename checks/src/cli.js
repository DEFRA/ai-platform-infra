import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { errorAnnotation } from './annotations.js'
import { canonicalJson } from './canonical-json.js'
import { readEnvironmentConfig } from './environment-config.js'
import { guardPlan, tenantsRemovals } from './plan-guard.js'
import { buildRunReport } from './run-report.js'
import { loadValidators } from './schemas.js'
import { buildTeamsVariables } from './teams-variables.js'
import {
  loadContext,
  validateCatalogue,
  validateEnvironmentsRepo,
  validatePinOnMain,
  validatePinsChange,
  validateTenantsChange,
  validateTenantsOnMain
} from './validate.js'

class UsageError extends Error {}

const INFRA_REMOTE = 'https://github.com/DEFRA/ai-platform-infra.git'

const OPTIONS = {
  infra: { type: 'string' },
  environments: { type: 'string' },
  repo: { type: 'string' },
  base: { type: 'string' },
  head: { type: 'string' },
  ref: { type: 'string' },
  environment: { type: 'string' },
  author: { type: 'string' },
  labels: { type: 'string', default: '' },
  approvers: { type: 'string', default: '' },
  'operation-id': { type: 'string' },
  'infra-remote': { type: 'string', default: INFRA_REMOTE },
  'reject-placeholders': { type: 'boolean', default: false },
  plan: { type: 'string' },
  state: { type: 'string' },
  'allow-destroy': { type: 'boolean', default: false },
  'apply-log': { type: 'string' },
  outputs: { type: 'string' },
  outcome: { type: 'string' },
  release: { type: 'string' },
  repository: { type: 'string' },
  'run-id': { type: 'string' },
  'run-attempt': { type: 'string' },
  'run-url': { type: 'string' },
  file: { type: 'string' },
  out: { type: 'string' }
}

function list(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function readOptional(path) {
  return path ? readFileSync(path, 'utf8') : null
}

function requireOptions(values, names) {
  const missing = names.filter((name) => !values[name])

  if (missing.length > 0) {
    throw new UsageError(`missing --${missing.join(', --')}`)
  }
}

/**
 * Resolves an ai-platform-infra tag to the commit it points at, preferring
 * the peeled commit of an annotated tag.
 *
 * @param {string} remote - Git URL of ai-platform-infra.
 * @returns {(tag: string) => string | null} Resolver.
 */
function tagResolver(remote) {
  return function resolveTag(tag) {
    const output = execFileSync(
      'git',
      ['ls-remote', remote, `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
      { encoding: 'utf8' }
    )
    const refs = Object.fromEntries(
      output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\t').reverse())
    )

    return refs[`refs/tags/${tag}^{}`] ?? refs[`refs/tags/${tag}`] ?? null
  }
}

function report(problems, io) {
  const inActions = process.env.GITHUB_ACTIONS === 'true'

  for (const { file, message } of problems) {
    io.stdout.write(
      inActions ? errorAnnotation(file, message) : `${file}: ${message}\n`
    )
  }

  return problems.length === 0 ? 0 : 1
}

function stateContext(values) {
  requireOptions(values, ['infra', 'environments', 'repo'])

  return loadContext({
    infraDir: values.infra,
    environmentsDir: values.environments
  })
}

function changeInput(values) {
  requireOptions(values, ['base', 'head', 'author'])

  return {
    repoDir: values.repo,
    base: values.base,
    head: values.head,
    context: stateContext(values),
    author: values.author,
    labels: list(values.labels),
    approvers: list(values.approvers),
    operationId: values['operation-id'],
    resolveTag: tagResolver(values['infra-remote'])
  }
}

const COMMANDS = {
  catalogue(values, io) {
    requireOptions(values, ['infra'])
    return report(validateCatalogue(values.infra), io)
  },

  environments(values, io) {
    requireOptions(values, ['infra', 'environments'])
    return report(
      validateEnvironmentsRepo({
        environmentsDir: values.environments,
        validators: loadValidators(values.infra),
        rejectPlaceholders: values['reject-placeholders']
      }),
      io
    )
  },

  tenants(values, io) {
    return report(validateTenantsChange(changeInput(values)).problems, io)
  },

  'tenants-on-main'(values, io) {
    requireOptions(values, ['ref', 'environment'])
    return report(
      validateTenantsOnMain({
        repoDir: values.repo,
        ref: values.ref,
        environment: values.environment,
        context: stateContext(values)
      }),
      io
    )
  },

  pins(values, io) {
    return report(validatePinsChange(changeInput(values)).problems, io)
  },

  'pin-on-main'(values, io) {
    requireOptions(values, ['ref', 'environment'])
    return report(
      validatePinOnMain({
        repoDir: values.repo,
        ref: values.ref,
        environment: values.environment,
        context: stateContext(values),
        resolveTag: tagResolver(values['infra-remote'])
      }),
      io
    )
  },

  'plan-guard'(values, io) {
    requireOptions(values, ['plan', 'state'])
    const explained =
      values.state === 'tenants'
        ? tenantsRemovals({
            repoDir: values.repo,
            base: values.base || null,
            head: values.head,
            environment: values.environment
          })
        : []
    const result = guardPlan({
      plan: JSON.parse(readFileSync(values.plan, 'utf8')),
      state: values.state,
      explained,
      allowDestroy: values['allow-destroy']
    })

    for (const violation of result.violations) {
      io.stdout.write(
        `${result.overridden ? 'allowed by allow_destroy' : 'refused'}: ` +
          `${violation.actions.join('+')} ${violation.address}\n`
      )
    }

    return result.allowed ? 0 : 1
  },

  'run-report'(values) {
    requireOptions(values, ['repo', 'head', 'environment', 'state', 'out'])
    const plan = readOptional(values.plan)
    const outputs = readOptional(values.outputs)
    const result = buildRunReport({
      repoDir: values.repo,
      base: values.base || null,
      head: values.head,
      environment: values.environment,
      state: values.state,
      plan: plan ? JSON.parse(plan) : null,
      applyLog: readOptional(values['apply-log']),
      outputs: outputs ? JSON.parse(outputs) : null,
      outcome: values.outcome ?? 'unknown',
      release: values.release ?? null,
      run: {
        repository: values.repository ?? null,
        id: values['run-id'] ?? null,
        attempt: values['run-attempt'] ?? null,
        url: values['run-url'] ?? null
      }
    })

    writeFileSync(values.out, canonicalJson(result))
    return 0
  },

  'teams-variables'(values) {
    requireOptions(values, ['repo', 'ref', 'environment', 'out'])
    writeFileSync(
      values.out,
      canonicalJson(
        buildTeamsVariables({
          repoDir: values.repo,
          ref: values.ref,
          environment: values.environment
        })
      )
    )
    return 0
  },

  // The one file Terraform reads an environment's parameters from.
  params(values, io) {
    requireOptions(values, ['infra', 'environments', 'environment', 'out'])
    const { $schema, ...params } = readEnvironmentConfig(
      values.environments,
      values.environment
    )
    const problems = loadValidators(values.infra)
      .environment(params)
      .map((message) => ({
        file: `environments/${values.environment}`,
        message
      }))

    if (problems.length > 0) {
      return report(problems, io)
    }

    writeFileSync(values.out, canonicalJson(params))
    return 0
  },

  canonical(values, io) {
    requireOptions(values, ['file'])
    io.stdout.write(
      canonicalJson(JSON.parse(readFileSync(values.file, 'utf8')))
    )
    return 0
  }
}

/**
 * Runs one aip-checks command.
 *
 * @param {string[]} argv - Arguments after the program name.
 * @param {{stdout: {write: Function}, stderr: {write: Function}}} io -
 *   Output streams.
 * @returns {number} Exit code: 0 passed, 1 failed, 2 usage error.
 */
function run(argv, io) {
  const [command, ...rest] = argv
  const handler = COMMANDS[command]

  if (!handler) {
    io.stderr.write(
      `usage: aip-checks <${Object.keys(COMMANDS).join('|')}> [options]\n`
    )
    return 2
  }

  try {
    const { values } = parseArgs({ args: rest, options: OPTIONS })
    return handler(values, io)
  } catch (error) {
    io.stderr.write(`${command}: ${error.message}\n`)
    return error instanceof UsageError || error.code?.startsWith('ERR_PARSE')
      ? 2
      : 1
  }
}

export { run, tagResolver }
