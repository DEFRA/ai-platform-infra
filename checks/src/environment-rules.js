const PUBLIC_ENVIRONMENTS = new Set(['infradev', 'sandbox'])
const PUBLIC_CLASSES = new Set(['platform-test', 'sandbox'])
const CONSUMER_CLASSES = new Set(['consumer-lower', 'consumer-production'])
const PLACEHOLDERS = [
  /@example\./i,
  /\bexample\.(com|org|net|gov\.uk)\b/i,
  /^0{8}-0{4}-0{4}-0{4}-0{11}[0-9]$/,
  /^https:\/\/0{8}-0{4}-0{4}-0{4}-0{12}\./,
  /^0{12}$/,
  /replace[-_ ]?me/i
]

function problem(file, message) {
  return { file, message }
}

function* strings(value, at = '') {
  if (typeof value === 'string') {
    yield [at, value]
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* strings(item, `${at}/${index}`)
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      yield* strings(item, `${at}/${key}`)
    }
  }
}

/**
 * Reports placeholder values copied from examples, so a real
 * configuration repository never ships them.
 *
 * @param {string} file - File the document came from.
 * @param {unknown} document - Parsed JSON.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function findPlaceholders(file, document) {
  const found = []

  for (const [at, value] of strings(document)) {
    if (at !== '/$schema' && PLACEHOLDERS.some((re) => re.test(value))) {
      found.push(problem(file, `${at} is a placeholder value`))
    }
  }

  return found
}

/**
 * Validates registry.json: schema and unique environment names.
 *
 * @param {object} registry - Parsed registry.
 * @param {Record<string, Function>} validators - Schema validators.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function checkRegistry(registry, validators) {
  const file = 'registry.json'
  const schemaProblems = validators.registry(registry)

  if (schemaProblems.length > 0) {
    return schemaProblems.map((message) => problem(file, message))
  }

  const problems = []
  const names = new Set()

  for (const entry of registry.environments) {
    if (names.has(entry.name)) {
      problems.push(problem(file, `environment ${entry.name} is listed twice`))
    }

    names.add(entry.name)
  }

  return problems
}

/**
 * Validates one environment's parameters against its registry entry. A
 * public setting is rejected everywhere except the Phase 1 proof in
 * Infradev and the Sandbox (design D #baseline).
 *
 * @param {object} input - Parameters and context.
 * @param {string} input.file - Repository-relative path.
 * @param {object} input.params - Effective parameters (global overlaid by
 *   the environment's platform.tfvars.json).
 * @param {object} input.entry - The registry entry.
 * @param {Record<string, Function>} input.validators - Schema validators.
 * @returns {Array<{file: string, message: string}>} Problems.
 */
function checkEnvironmentParams({ file, params, entry, validators }) {
  const schemaProblems = validators.environment(params)

  if (schemaProblems.length > 0) {
    return schemaProblems.map((message) => problem(file, message))
  }

  const problems = []
  const { azure } = params
  const isPublic = azure.network.mode === 'public-minimal'

  if (params.environment !== entry.name) {
    problems.push(problem(file, 'environment must equal the registry entry'))
  }

  if (azure.foundry.regions[0] !== azure.location) {
    problems.push(
      problem(file, `the first Foundry region must be ${azure.location}`)
    )
  }

  if (isPublic) {
    if (
      !PUBLIC_ENVIRONMENTS.has(entry.name) ||
      !PUBLIC_CLASSES.has(entry.class)
    ) {
      problems.push(
        problem(
          file,
          'public-minimal is allowed only in Infradev and the Sandbox ' +
            'until the gate before DEV'
        )
      )
    }

    if (azure.named_exceptions.length > 0) {
      problems.push(
        problem(file, 'named exceptions apply only to the private topology')
      )
    }

    if (!entry.runner.labels) {
      problems.push(
        problem(file, 'public-minimal applies from standard runners')
      )
    }
  } else {
    problems.push(
      problem(
        file,
        'the private topology is built at the gate before DEV; the platform ' +
          'root does not implement it yet'
      )
    )

    if (!entry.runner.group) {
      problems.push(problem(file, 'the private topology needs a runner group'))
    }
  }

  if (azure.existing_resource_group && !PUBLIC_CLASSES.has(entry.class)) {
    problems.push(
      problem(
        file,
        'an existing resource group is for Infradev and the Sandbox only, ' +
          'until the gate before DEV'
      )
    )
  }

  if (CONSUMER_CLASSES.has(entry.class) && azure.apim.sku !== 'PremiumV2') {
    problems.push(problem(file, 'consumer environments run PremiumV2 (D15)'))
  }

  return problems
}

export {
  checkEnvironmentParams,
  checkRegistry,
  findPlaceholders,
  PUBLIC_ENVIRONMENTS
}
