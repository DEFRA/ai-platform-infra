import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { INFRA_DIR } from '../fixtures/gitops-files.js'

const BOOTSTRAP_DIR = join(INFRA_DIR, 'bootstrap')
const GRANT_TYPES = /role_assignment|role_definition|app_role|directory_role/

/**
 * The top-level resource blocks of a Terraform file that grant a role and
 * mention the events identity, which holds no Azure role (design C
 * #identities). The Terraform tests assert the grants that exist; this is
 * the tripwire for one added later that they do not list.
 *
 * @param {string} source - Terraform source text.
 * @returns {string[]} The `type.name` addresses of the offending blocks.
 */
function eventsRoleGrants(source) {
  return source
    .split(/^}\s*$/m)
    .map((block) =>
      block.match(/^\s*resource\s+"([^"]+)"\s+"([^"]+)"\s*{([\s\S]*)$/m)
    )
    .filter(Boolean)
    .filter(
      ([, type, , body]) => GRANT_TYPES.test(type) && /events/i.test(body)
    )
    .map(([, type, name]) => `${type}.${name}`)
}

describe('the events identity holds no Azure role', () => {
  test('no bootstrap file grants a role that mentions it', () => {
    const grants = readdirSync(BOOTSTRAP_DIR)
      .filter((file) => file.endsWith('.tf'))
      .flatMap((file) =>
        eventsRoleGrants(readFileSync(join(BOOTSTRAP_DIR, file), 'utf8')).map(
          (address) => `${file}: ${address}`
        )
      )

    expect(grants).toEqual([])
  })

  test('the tripwire finds a role assignment to the identity', () => {
    const source = `
resource "azurerm_user_assigned_identity" "events" {
  name = "x"
}

resource "azurerm_role_assignment" "events_queue" {
  principal_id = azurerm_user_assigned_identity.events.principal_id
}
`

    expect(eventsRoleGrants(source)).toEqual([
      'azurerm_role_assignment.events_queue'
    ])
  })

  test('the tripwire finds an Entra app role granted to it', () => {
    const source = `resource "azuread_app_role_assignment" "graph" {
  principal_object_id = azurerm_user_assigned_identity.events.principal_id
}
`

    expect(eventsRoleGrants(source)).toEqual([
      'azuread_app_role_assignment.graph'
    ])
  })

  test('the tripwire leaves the identity, its credentials and other grants alone', () => {
    const source = `
resource "azurerm_user_assigned_identity" "events" {
  name = "x"
}

resource "azurerm_federated_identity_credential" "events" {
  name = "y"
}

resource "azurerm_role_assignment" "deploy_state" {
  principal_id = data.azuread_service_principal.deploy.object_id
}
`

    expect(eventsRoleGrants(source)).toEqual([])
  })
})
