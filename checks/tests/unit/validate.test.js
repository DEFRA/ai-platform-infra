import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  loadContext,
  singleEnvironment,
  validateCatalogue,
  validateEnvironmentsRepo,
  validatePinOnMain,
  validatePinsChange,
  validateTenantsChange,
  validateTenantsOnMain
} from '../../src/validate.js'
import { loadValidators } from '../../src/schemas.js'
import {
  ENVIRONMENTS_DIR,
  environmentParams,
  globalParams,
  INFRA_DIR,
  keyTeam,
  oauthTeam,
  pin,
  registryEntry,
  serialise,
  teamPath
} from '../fixtures/gitops-files.js'
import { createRepository } from '../helpers/repository.js'

const context = loadContext({
  infraDir: INFRA_DIR,
  environmentsDir: ENVIRONMENTS_DIR
})
const WRITER = 'ai-platform-orchestrator[bot]'
const SHA = '0000000000000000000000000000000000000000'

let repository
let base

beforeEach(() => {
  repository = createRepository()
  repository.write('README.md', '# state\n')
  base = repository.commit('chore: initialise')
})

afterEach(() => repository.destroy())

function messages(result) {
  return (result.problems ?? result).map((problem) => problem.message)
}

function submitTeam(document) {
  repository.write(teamPath(document), serialise(document))
  return repository.commit(`chore: write ${document.team.slug}`)
}

describe('validateTenantsChange', () => {
  test('accepts a key team written by the App', () => {
    const head = submitTeam(keyTeam())

    expect(
      validateTenantsChange({
        repoDir: repository.dir,
        base,
        head,
        context,
        author: WRITER,
        operationId: keyTeam().operationId
      })
    ).toEqual({ environment: 'infradev', problems: [] })
  })

  test('refuses a change outside environments/', () => {
    repository.write('.github/workflows/apply.yml', 'on: push\n')
    const head = submitTeam(keyTeam())

    expect(
      messages(
        validateTenantsChange({
          repoDir: repository.dir,
          base,
          head,
          context,
          author: WRITER
        })
      )
    ).toContain('only files under environments/ may change')
  })

  test('refuses an environment missing from the registry', () => {
    const document = keyTeam({ environment: 'qa' })
    const head = submitTeam(document)

    expect(
      messages(
        validateTenantsChange({
          repoDir: repository.dir,
          base,
          head,
          context,
          author: WRITER
        })
      )
    ).toEqual(['not in the registry'])
  })

  test('refuses an author who is not a writer', () => {
    const head = submitTeam(keyTeam())

    expect(
      messages(
        validateTenantsChange({
          repoDir: repository.dir,
          base,
          head,
          context,
          author: 'engineer'
        })
      )
    ).toEqual([expect.stringContaining('only a registry writer App')])
  })

  test('refuses capacity that together exceeds the quota', () => {
    for (const slug of ['team-a', 'team-b', 'team-c']) {
      const team = keyTeam({ team: { slug, serviceCode: 'ZZZ' } })
      repository.write(
        teamPath(team),
        serialise({
          ...team,
          deployments: [{ ...team.deployments[0], capacity: 4 }]
        })
      )
    }
    const head = repository.commit('chore: three teams')

    expect(
      messages(
        validateTenantsChange({
          repoDir: repository.dir,
          base,
          head,
          context,
          author: WRITER
        })
      )
    ).toEqual(['gpt-5-nano capacity 12 exceeds the infradev quota 10'])
  })

  test('accepts the removal of a team file', () => {
    const before = submitTeam(oauthTeam())
    repository.remove(teamPath(oauthTeam()))
    const head = repository.commit('chore: remove beta')

    expect(
      validateTenantsChange({
        repoDir: repository.dir,
        base: before,
        head,
        context,
        author: WRITER
      }).problems
    ).toEqual([])
  })
})

describe('validateTenantsOnMain', () => {
  test('re-validates every team file in the environment', () => {
    const head = submitTeam(keyTeam({ revision: 0 }))

    expect(
      messages(
        validateTenantsOnMain({
          repoDir: repository.dir,
          ref: head,
          environment: 'infradev',
          context
        })
      )
    ).toEqual(['/revision must be >= 1'])
  })

  test('refuses an environment missing from the registry', () => {
    expect(
      messages(
        validateTenantsOnMain({
          repoDir: repository.dir,
          ref: base,
          environment: 'qa',
          context
        })
      )
    ).toEqual(['not in the registry'])
  })
})

describe('validatePinsChange', () => {
  const resolveTag = (tag) => (tag === 'v0.4.0' ? SHA : null)

  test('accepts the first pin for an environment', () => {
    const document = pin({ previousRelease: null })
    repository.write('environments/infradev/platform.json', serialise(document))
    const head = repository.commit('chore: pin infradev')

    expect(
      validatePinsChange({
        repoDir: repository.dir,
        base,
        head,
        context,
        author: WRITER,
        resolveTag,
        operationId: document.operationId
      }).problems
    ).toEqual([])
  })

  test('refuses deleting a pin', () => {
    repository.write('environments/infradev/platform.json', serialise(pin()))
    const before = repository.commit('chore: pin')
    repository.remove('environments/infradev/platform.json')
    const head = repository.commit('chore: unpin')

    expect(
      messages(
        validatePinsChange({
          repoDir: repository.dir,
          base: before,
          head,
          context,
          author: WRITER,
          resolveTag
        })
      )
    ).toEqual(['a pin is replaced, never deleted'])
  })
})

describe('validatePinOnMain', () => {
  const resolveTag = () => SHA

  test('accepts the pin on main', () => {
    repository.write('environments/infradev/platform.json', serialise(pin()))
    const head = repository.commit('chore: pin')

    expect(
      validatePinOnMain({
        repoDir: repository.dir,
        ref: head,
        environment: 'infradev',
        context,
        resolveTag
      })
    ).toEqual([])
  })

  test('refuses an environment with no pin', () => {
    expect(
      messages(
        validatePinOnMain({
          repoDir: repository.dir,
          ref: base,
          environment: 'infradev',
          context,
          resolveTag
        })
      )
    ).toEqual(['no pin exists for this environment'])
  })
})

describe('validateEnvironmentsRepo', () => {
  const validators = loadValidators(INFRA_DIR)
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aip-environments-'))
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function writeRepo(registry, folders, global = globalParams()) {
    writeFileSync(join(dir, 'registry.json'), serialise(registry))

    if (global) {
      writeFileSync(join(dir, 'global.tfvars.json'), serialise(global))
    }

    for (const [name, params] of Object.entries(folders)) {
      mkdirSync(join(dir, 'environments', name), { recursive: true })
      if (params) {
        writeFileSync(
          join(dir, 'environments', name, 'platform.tfvars.json'),
          serialise(params)
        )
      }
    }
  }

  test('accepts the example configuration', () => {
    expect(
      validateEnvironmentsRepo({
        environmentsDir: ENVIRONMENTS_DIR,
        validators
      })
    ).toEqual([])
  })

  test('refuses example values when placeholders are rejected', () => {
    expect(
      messages(
        validateEnvironmentsRepo({
          environmentsDir: ENVIRONMENTS_DIR,
          validators,
          rejectPlaceholders: true
        })
      )
    ).toContain('/apim_publisher/email is a placeholder value')
  })

  test('refuses a configuration without shared parameters', () => {
    writeRepo(
      { schemaVersion: 1, environments: [registryEntry()] },
      { infradev: environmentParams() },
      null
    )

    expect(
      messages(validateEnvironmentsRepo({ environmentsDir: dir, validators }))
    ).toEqual(['the shared parameters are missing'])
  })

  test('refuses an environment without its own keys', () => {
    writeRepo(
      { schemaVersion: 1, environments: [registryEntry()] },
      { infradev: { foundry_regions: ['swedencentral'] } }
    )

    expect(
      messages(validateEnvironmentsRepo({ environmentsDir: dir, validators }))
    ).toContain("/ must have required property 'environment'")
  })

  test('validates the effective parameters of an environment', () => {
    writeRepo(
      { schemaVersion: 1, environments: [registryEntry()] },
      { infradev: environmentParams({ foundry_regions: ['swedencentral'] }) }
    )

    expect(
      messages(validateEnvironmentsRepo({ environmentsDir: dir, validators }))
    ).toEqual(['the first Foundry region must be uksouth'])
  })

  test('refuses a folder without a registry entry', () => {
    writeRepo(
      { schemaVersion: 1, environments: [registryEntry()] },
      { infradev: environmentParams(), qa: null }
    )

    expect(
      messages(validateEnvironmentsRepo({ environmentsDir: dir, validators }))
    ).toEqual(['not in the registry'])
  })

  test('refuses a registry entry without parameters', () => {
    writeRepo({ schemaVersion: 1, environments: [registryEntry()] }, {})

    expect(
      messages(validateEnvironmentsRepo({ environmentsDir: dir, validators }))
    ).toEqual(['every registry entry needs parameters'])
  })

  test('stops at an invalid registry', () => {
    writeRepo({ schemaVersion: 2, environments: [] }, {})

    expect(
      messages(validateEnvironmentsRepo({ environmentsDir: dir, validators }))
    ).toContain('/schemaVersion must be equal to constant')
  })
})

describe('validateCatalogue', () => {
  test('accepts the catalogue in this repository', () => {
    expect(validateCatalogue(INFRA_DIR)).toEqual([])
  })
})

describe('singleEnvironment', () => {
  test('refuses a pull request that changes two environments', () => {
    const result = singleEnvironment([
      { status: 'A', path: 'environments/infradev/a.json' },
      { status: 'A', path: 'environments/sandbox/a.json' }
    ])

    expect(result.problems).toEqual([
      {
        file: 'environments',
        message: 'one pull request changes one environment'
      }
    ])
  })

  test('refuses a pull request that changes no environment', () => {
    expect(singleEnvironment([]).problems).toEqual([
      { file: 'environments', message: 'no environment file changed' }
    ])
  })
})
