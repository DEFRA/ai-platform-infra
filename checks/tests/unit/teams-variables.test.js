import { buildTeamsVariables } from '../../src/teams-variables.js'
import {
  alphaTeam,
  betaTeam,
  serialise,
  teamPath
} from '../fixtures/gitops-files.js'
import { createRepository } from '../helpers/repository.js'

describe('buildTeamsVariables', () => {
  test('bundles active teams with the commit that last changed each', () => {
    const repository = createRepository()

    try {
      repository.write(teamPath(alphaTeam()), serialise(alphaTeam()))
      const alphaSha = repository.commit('chore: alpha')
      const removed = betaTeam({ status: 'removed', deployments: [] })
      delete removed.oauth
      repository.write(teamPath(removed), serialise(removed))
      const head = repository.commit('chore: beta removed')

      expect(
        buildTeamsVariables({
          repoDir: repository.dir,
          ref: head,
          environment: 'infradev'
        })
      ).toEqual({
        teams: { alpha: alphaTeam() },
        team_sources: {
          alpha: { sha: alphaSha, operation_id: alphaTeam().operationId }
        }
      })
    } finally {
      repository.destroy()
    }
  })
})
