import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { checkAuthor } from './author.js'
import { checkCatalogue, loadCatalogue, modelsBySlug } from './catalogue.js'
import {
  checkEnvironmentParams,
  checkRegistry,
  findPlaceholders
} from './environment-rules.js'
import { GLOBAL_FILE, readEnvironmentConfig } from './environment-config.js'
import { changedFiles, listFilesAt, readFileAt } from './git.js'
import { checkPin } from './pin-rules.js'
import { loadValidators, readJson } from './schemas.js'
import {
  checkEnvironmentTeams,
  checkTeamFile,
  parseTeamPath
} from './team-rules.js'

const ENVIRONMENT_FOLDER = /^environments\/([a-z][a-z0-9]{1,15})\//

function problem(file, message) {
  return { file, message }
}

/**
 * Loads what every state check needs from an infra checkout at the
 * environment's pinned release and an environments checkout.
 *
 * @param {object} input - Locations.
 * @param {string} input.infraDir - ai-platform-infra at the pin.
 * @param {string} input.environmentsDir - ai-platform-environments at main.
 * @returns {{validators: object, catalogue: object, models: Map,
 *   registry: object}} Loaded context.
 */
function loadContext({ infraDir, environmentsDir }) {
  const validators = loadValidators(infraDir)
  const catalogue = loadCatalogue(infraDir)

  return {
    validators,
    catalogue,
    models: modelsBySlug(catalogue),
    registry: readJson(join(environmentsDir, 'registry.json')),
    environmentsDir
  }
}

function entryFor(context, environment) {
  return context.registry.environments.find((e) => e.name === environment)
}

function paramsFor(context, environment) {
  return readEnvironmentConfig(context.environmentsDir, environment)
}

/**
 * Splits a pull request's changes by environment, enforcing that the
 * repository only ever changes files under environments/ and that one pull
 * request changes one environment.
 *
 * @param {Array<{status: string, path: string}>} files - Changed files.
 * @returns {{environment: string | null,
 *   problems: Array<{file: string, message: string}>}} Result.
 */
function singleEnvironment(files) {
  const problems = []
  const environments = new Set()

  for (const { path } of files) {
    const match = ENVIRONMENT_FOLDER.exec(path)

    if (match) {
      environments.add(match[1])
    } else {
      problems.push(problem(path, 'only files under environments/ may change'))
    }
  }

  if (environments.size > 1) {
    problems.push(
      problem('environments', 'one pull request changes one environment')
    )
  }

  if (environments.size === 0) {
    problems.push(problem('environments', 'no environment file changed'))
  }

  return { environment: [...environments][0] ?? null, problems }
}

function readTeams(repoDir, ref, environment) {
  return listFilesAt(repoDir, ref, `environments/${environment}`)
    .filter((path) => parseTeamPath(path))
    .map((path) => ({ path, text: readFileAt(repoDir, ref, path) }))
}

function checkWholeEnvironment(repoDir, ref, environment, context) {
  const entry = entryFor(context, environment)
  const params = paramsFor(context, environment)
  const problems = []
  const teams = []

  for (const { path, text } of readTeams(repoDir, ref, environment)) {
    const fileProblems = checkTeamFile({
      path,
      text,
      previousText: null,
      entry,
      params,
      models: context.models,
      validators: context.validators
    })

    problems.push(...fileProblems)
    if (fileProblems.length === 0) {
      teams.push({ path, document: JSON.parse(text) })
    }
  }

  problems.push(
    ...checkEnvironmentTeams({ teams, environment, models: context.models })
  )

  return problems
}

/**
 * Validates a pull request in ai-platform-tenants, or a submission staged
 * as a local commit by the submit workflow.
 *
 * @param {object} input - Pull request facts and context.
 * @param {string} input.repoDir - Tenants checkout containing both commits.
 * @param {string} input.base - Base commit.
 * @param {string} input.head - Head commit.
 * @param {object} input.context - From loadContext.
 * @param {string} input.author - Pull request author login.
 * @param {string[]} [input.labels] - Pull request labels.
 * @param {string[]} [input.approvers] - Logins that approved the head.
 * @param {string} [input.operationId] - From the op/{id} branch.
 * @returns {{environment: string | null,
 *   problems: Array<{file: string, message: string}>}} Result.
 */
function validateTenantsChange(input) {
  const { repoDir, base, head, context } = input
  const files = changedFiles(repoDir, base, head)
  const { environment, problems } = singleEnvironment(files)

  if (!environment) {
    return { environment, problems }
  }

  const entry = entryFor(context, environment)
  if (!entry) {
    problems.push(problem(`environments/${environment}`, 'not in the registry'))
    return { environment, problems }
  }

  const author = checkAuthor({ ...input, entry })
  if (!author.allowed) {
    problems.push(problem(`environments/${environment}`, author.reason))
  }

  const params = paramsFor(context, environment)

  for (const { status, path } of files) {
    if (status === 'D') {
      continue
    }

    problems.push(
      ...checkTeamFile({
        path,
        text: readFileAt(repoDir, head, path),
        previousText: readFileAt(repoDir, base, path),
        entry,
        params,
        models: context.models,
        validators: context.validators,
        operationId: author.writer ? input.operationId : undefined
      })
    )
  }

  if (problems.length === 0) {
    problems.push(...checkWholeEnvironment(repoDir, head, environment, context))
  }

  return { environment, problems }
}

/**
 * Re-validates every team file of one environment on main before an apply,
 * so two pull requests cannot together break a rule (R4).
 *
 * @param {object} input - Location and context.
 * @param {string} input.repoDir - Tenants checkout.
 * @param {string} input.ref - Commit about to be applied.
 * @param {string} input.environment - Environment name.
 * @param {object} input.context - From loadContext.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function validateTenantsOnMain({ repoDir, ref, environment, context }) {
  if (!entryFor(context, environment)) {
    return [problem(`environments/${environment}`, 'not in the registry')]
  }

  return checkWholeEnvironment(repoDir, ref, environment, context)
}

/**
 * Validates a pull request in ai-platform-deployments, or a staged pin
 * submission.
 *
 * @param {object} input - As validateTenantsChange, plus resolveTag.
 * @param {(tag: string) => string | null} input.resolveTag - Tag resolver.
 * @returns {{environment: string | null,
 *   problems: Array<{file: string, message: string}>}} Result.
 */
function validatePinsChange(input) {
  const { repoDir, base, head, context } = input
  const files = changedFiles(repoDir, base, head)
  const { environment, problems } = singleEnvironment(files)

  if (!environment) {
    return { environment, problems }
  }

  const entry = entryFor(context, environment)
  if (!entry) {
    problems.push(problem(`environments/${environment}`, 'not in the registry'))
    return { environment, problems }
  }

  const author = checkAuthor({ ...input, entry })
  if (!author.allowed) {
    problems.push(problem(`environments/${environment}`, author.reason))
  }

  for (const { status, path } of files) {
    if (status === 'D') {
      problems.push(problem(path, 'a pin is replaced, never deleted'))
      continue
    }

    problems.push(
      ...checkPin({
        path,
        text: readFileAt(repoDir, head, path),
        previousText: readFileAt(repoDir, base, path),
        entry,
        validators: context.validators,
        resolveTag: input.resolveTag,
        operationId: author.writer ? input.operationId : undefined
      })
    )
  }

  return { environment, problems }
}

/**
 * Re-validates one environment's pin on main before a platform apply.
 *
 * @param {object} input - Location, context and tag resolver.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function validatePinOnMain({ repoDir, ref, environment, context, resolveTag }) {
  const entry = entryFor(context, environment)
  const path = `environments/${environment}/platform.json`

  if (!entry) {
    return [problem(path, 'not in the registry')]
  }

  const text = readFileAt(repoDir, ref, path)
  if (text === null) {
    return [problem(path, 'no pin exists for this environment')]
  }

  return checkPin({
    path,
    text,
    entry,
    validators: context.validators,
    resolveTag
  })
}

/**
 * Validates the whole ai-platform-environments checkout: the registry,
 * one parameters file per entry and no folder without an entry.
 *
 * @param {object} input - Location and options.
 * @param {string} input.environmentsDir - ai-platform-environments checkout.
 * @param {Record<string, Function>} input.validators - Schema validators.
 * @param {boolean} [input.rejectPlaceholders] - Fail on example values.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function validateEnvironmentsRepo(input) {
  const { environmentsDir, validators, rejectPlaceholders } = input
  const registry = readJson(join(environmentsDir, 'registry.json'))
  const problems = checkRegistry(registry, validators)

  if (problems.length > 0) {
    return problems
  }

  if (rejectPlaceholders) {
    problems.push(...findPlaceholders('registry.json', registry))
  }

  const globalPath = join(environmentsDir, GLOBAL_FILE)
  if (!existsSync(globalPath)) {
    problems.push(problem(GLOBAL_FILE, 'the shared parameters are missing'))
    return problems
  }

  if (rejectPlaceholders) {
    problems.push(...findPlaceholders(GLOBAL_FILE, readJson(globalPath)))
  }

  const folder = join(environmentsDir, 'environments')
  const folders = existsSync(folder) ? readdirSync(folder) : []

  for (const name of folders) {
    if (!registry.environments.some((entry) => entry.name === name)) {
      problems.push(problem(`environments/${name}`, 'not in the registry'))
    }
  }

  for (const entry of registry.environments) {
    const file = `environments/${entry.name}/platform.tfvars.json`
    const path = join(environmentsDir, file)

    if (!existsSync(path)) {
      problems.push(problem(file, 'every registry entry needs parameters'))
      continue
    }

    problems.push(
      ...checkEnvironmentParams({
        file,
        params: readEnvironmentConfig(environmentsDir, entry.name),
        entry,
        validators
      })
    )

    if (rejectPlaceholders) {
      problems.push(...findPlaceholders(file, readJson(path)))
    }
  }

  return problems
}

/**
 * Validates the catalogue of an infra checkout.
 *
 * @param {string} infraDir - ai-platform-infra checkout.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function validateCatalogue(infraDir) {
  return checkCatalogue(loadCatalogue(infraDir), loadValidators(infraDir)).map(
    (message) => problem('catalogue', message)
  )
}

export {
  loadContext,
  singleEnvironment,
  validateCatalogue,
  validateEnvironmentsRepo,
  validatePinOnMain,
  validatePinsChange,
  validateTenantsChange,
  validateTenantsOnMain
}
