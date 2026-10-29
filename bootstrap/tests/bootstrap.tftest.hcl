mock_provider "azurerm" {
  mock_resource "azurerm_storage_account" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/example/providers/Microsoft.Storage/storageAccounts/example"
    }
  }

  mock_resource "azurerm_storage_container" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/example/providers/Microsoft.Storage/storageAccounts/example/blobServices/default/containers/tfstate"
    }
  }

  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/example/providers/Microsoft.ManagedIdentity/userAssignedIdentities/example"
      client_id    = "00000000-0000-0000-0000-0000000000e1"
      principal_id = "00000000-0000-0000-0000-0000000000e2"
      tenant_id    = "00000000-0000-0000-0000-0000000000e3"
    }
  }
}
mock_provider "azuread" {
  mock_data "azuread_application" {
    defaults = {
      id        = "/applications/00000000-0000-0000-0000-000000000001"
      client_id = "00000000-0000-0000-0000-000000000003"
      api = [{
        requested_access_token_version = 1
      }]
    }
  }

  mock_data "azuread_service_principal" {
    defaults = {
      object_id = "00000000-0000-0000-0000-000000000002"
    }
  }

  mock_resource "azuread_application" {
    defaults = {
      id        = "/applications/00000000-0000-0000-0000-0000000000a2"
      client_id = "00000000-0000-0000-0000-0000000000a1"
      object_id = "00000000-0000-0000-0000-0000000000a2"
    }
  }
}

variables {
  params_file      = "../names/tests/params.tfvars.json"
  deploy_client_id = "00000000-0000-0000-0000-000000000000"
  oidc_subject_prefixes = {
    "ai-platform-tenants"     = "repo:DEFRA@1/ai-platform-tenants@2"
    "ai-platform-deployments" = "repo:DEFRA@1/ai-platform-deployments@3"
  }
}

run "federates_exactly_the_two_state_repositories" {
  command = plan

  assert {
    condition     = toset(keys(azuread_application_federated_identity_credential.deploy)) == toset(["ai-platform-tenants", "ai-platform-deployments"])
    error_message = "the deploy identity must trust both state repositories and nothing else"
  }
}

run "keeps_state_and_role_administration_in_an_existing_resource_group" {
  command = plan

  variables {
    params_file = "tests/params-existing-resource-group.tfvars.json"
  }

  assert {
    condition     = length(azurerm_resource_group.state) == 0 && azurerm_storage_account.state.resource_group_name == "SNDAIEAIPRGP1401"
    error_message = "the state account goes into the existing resource group, which bootstrap does not create"
  }

  assert {
    condition     = endswith(azurerm_role_assignment.deploy_rbac_administrator[0].scope, "/resourceGroups/SNDAIEAIPRGP1401")
    error_message = "role administration is scoped to the existing resource group"
  }

  assert {
    condition     = endswith(azurerm_role_assignment.deploy_contributor[0].scope, "/resourceGroups/SNDAIEAIPRGP1401")
    error_message = "Contributor is scoped to the existing resource group, never the subscription"
  }
}

run "grants_contributor_at_the_subscription_without_an_existing_resource_group" {
  command = plan

  assert {
    condition     = !strcontains(azurerm_role_assignment.deploy_contributor[0].scope, "/resourceGroups/")
    error_message = "with no resource group made in advance the platform creates its own, so Contributor is at the subscription"
  }
}

run "grants_no_contributor_where_the_deploy_identity_holds_it" {
  command = plan

  variables {
    grant_contributor = false
  }

  assert {
    condition     = length(azurerm_role_assignment.deploy_contributor) == 0
    error_message = "grant_contributor = false must create no Contributor assignment"
  }
}

run "grants_user_access_administrator_only_when_asked" {
  command = plan

  assert {
    condition     = length(azurerm_role_assignment.deploy_user_access_administrator) == 0
    error_message = "User Access Administrator is opt-in: an environment that already holds it is left alone"
  }
}

run "grants_user_access_administrator_at_the_contributor_scope" {
  command = plan

  variables {
    grant_user_access_administrator = true
  }

  assert {
    condition     = azurerm_role_assignment.deploy_user_access_administrator[0].scope == azurerm_role_assignment.deploy_contributor[0].scope && azurerm_role_assignment.deploy_user_access_administrator[0].principal_type == "ServicePrincipal"
    error_message = "the platform's custom role needs a role that can write definitions, at the scope the platform is built in"
  }
}

run "refuses_a_missing_state_repository" {
  command = plan

  variables {
    oidc_subject_prefixes = {
      "ai-platform-tenants" = "repo:DEFRA@1/ai-platform-tenants@2"
    }
  }

  expect_failures = [var.oidc_subject_prefixes]
}

run "refuses_a_prefix_for_the_other_repository" {
  command = plan

  variables {
    oidc_subject_prefixes = {
      "ai-platform-tenants"     = "repo:DEFRA@1/ai-platform-deployments@3"
      "ai-platform-deployments" = "repo:DEFRA@1/ai-platform-deployments@3"
    }
  }

  expect_failures = [var.oidc_subject_prefixes]
}

run "locks_the_state_account_from_the_first_pass_and_nothing_else" {
  command = plan

  assert {
    condition     = length(azurerm_management_lock.state_account) == 1 && azurerm_management_lock.state_account[0].lock_level == "CanNotDelete" && azurerm_management_lock.state_account[0].name == "aip-no-delete"
    error_message = "the state account is locked against deletion as soon as it exists"
  }

  assert {
    condition     = length(azurerm_management_lock.platform) == 0
    error_message = "the platform's resources are locked on a second pass only, once they exist"
  }
}

run "lifts_the_state_lock_for_the_apply_that_revokes_the_operator" {
  command = plan

  variables {
    operator_state_access = false
    lock_state_account    = false
  }

  assert {
    condition     = length(azurerm_management_lock.state_account) == 0 && length(azurerm_role_assignment.operator_state) == 0
    error_message = "the operator's assignment sits under the lock, so the apply that removes it runs with the lock lifted"
  }

  assert {
    condition     = azurerm_role_assignment.deploy_state.principal_type == "ServicePrincipal"
    error_message = "the deploy identity keeps its state access through the revocation"
  }
}

run "locks_the_vaults_and_workspace_on_the_second_pass" {
  command = plan

  variables {
    lock_platform_resources = true
  }

  override_data {
    target = data.azurerm_key_vault.platform["key_vault_platform"]
    values = { id = "/subscriptions/0/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.KeyVault/vaults/sndaipappkvt1401" }
  }

  override_data {
    target = data.azurerm_key_vault.platform["key_vault_tenants"]
    values = { id = "/subscriptions/0/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.KeyVault/vaults/sndaipappkvt1402" }
  }

  override_data {
    target = data.azurerm_log_analytics_workspace.platform[0]
    values = { id = "/subscriptions/0/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.OperationalInsights/workspaces/SNDAIPAPPLW1401" }
  }

  assert {
    condition     = toset(keys(azurerm_management_lock.platform)) == toset(["key_vault_platform", "key_vault_tenants", "log_analytics_workspace"])
    error_message = "both vaults and the workspace are locked; API Management and the Foundry accounts are not, so team children stay removable"
  }

  assert {
    condition     = alltrue([for lock in azurerm_management_lock.platform : lock.lock_level == "CanNotDelete"])
    error_message = "the locks refuse deletion only, never changes"
  }

  assert {
    condition     = data.azurerm_key_vault.platform["key_vault_tenants"].name == "sndaipappkvt1402" && data.azurerm_log_analytics_workspace.platform[0].name == "SNDAIPAPPLW1401"
    error_message = "the locked resources are looked up by their CCoE names"
  }
}

# The events identity (design C #identities, async GitOps operations): the
# workflows publish status events as id-aip-events-{env}, which holds no Azure
# role and trusts only the two state repositories' Environments.
run "creates_the_events_identity_in_the_state_resource_group" {
  command = plan

  assert {
    condition     = azurerm_user_assigned_identity.events.name == "id-aip-events-infradev"
    error_message = "the events identity takes the logical label id-aip-events-{env}"
  }

  assert {
    condition     = azurerm_user_assigned_identity.events.resource_group_name == "SNDAIPINFRGP1402" && azurerm_user_assigned_identity.events.location == "uksouth"
    error_message = "the identity sits beside the state account, in the state resource group"
  }

  assert {
    condition     = azurerm_user_assigned_identity.events.tags == azurerm_storage_account.state.tags
    error_message = "the identity carries the bootstrap's tags"
  }
}

run "federates_the_events_identity_to_exactly_four_subjects" {
  command = apply

  assert {
    condition = toset(output.events_federated_subjects) == toset([
      "repo:DEFRA@1/ai-platform-tenants@2:environment:infradev",
      "repo:DEFRA@1/ai-platform-tenants@2:environment:infradev-events",
      "repo:DEFRA@1/ai-platform-deployments@3:environment:infradev",
      "repo:DEFRA@1/ai-platform-deployments@3:environment:infradev-events",
    ])
    error_message = "the events identity trusts the {env} and {env}-events Environments of both state repositories, and nothing else"
  }

  assert {
    condition     = length(output.events_federated_subjects) == 4 && length(azurerm_federated_identity_credential.events) == 4
    error_message = "two repositories times two Environments: four credentials, no more"
  }

  assert {
    condition = alltrue([
      for credential in azurerm_federated_identity_credential.events :
      credential.issuer == "https://token.actions.githubusercontent.com" && toset(credential.audience) == toset(["api://AzureADTokenExchange"]) && credential.user_assigned_identity_id == azurerm_user_assigned_identity.events.id
    ])
    error_message = "every credential trusts GitHub's issuer for the Azure token exchange, on the events identity alone"
  }

  assert {
    condition = toset([for credential in azurerm_federated_identity_credential.events : credential.name]) == toset([
      "ai-platform-tenants-infradev",
      "ai-platform-tenants-infradev-events",
      "ai-platform-deployments-infradev",
      "ai-platform-deployments-infradev-events",
    ])
    error_message = "credential names are derived from the repository and Environment, so a repeat apply changes nothing"
  }
}

run "gives_the_events_identity_no_azure_role" {
  command = apply

  variables {
    grant_user_access_administrator = true
  }

  assert {
    condition = alltrue(concat(
      [for assignment in azurerm_role_assignment.operator_state : assignment.principal_id != azurerm_user_assigned_identity.events.principal_id],
      [for assignment in azurerm_role_assignment.deploy_contributor : assignment.principal_id != azurerm_user_assigned_identity.events.principal_id],
      [for assignment in azurerm_role_assignment.deploy_user_access_administrator : assignment.principal_id != azurerm_user_assigned_identity.events.principal_id],
      [for assignment in azurerm_role_assignment.deploy_rbac_administrator : assignment.principal_id != azurerm_user_assigned_identity.events.principal_id],
      [azurerm_role_assignment.deploy_state.principal_id != azurerm_user_assigned_identity.events.principal_id],
    ))
    error_message = "no role assignment of the bootstrap names the events identity: it signs in and nothing more"
  }

  assert {
    condition     = azurerm_user_assigned_identity.events.principal_id != data.azuread_service_principal.deploy.object_id
    error_message = "the events identity is not the deploy identity"
  }
}

run "audiences_the_events_token_to_the_deploy_registration" {
  command = apply

  assert {
    condition     = azuread_application_identifier_uri.events_audience.application_id == data.azuread_application.deploy.id && azuread_application_identifier_uri.events_audience.identifier_uri == "api://${data.azuread_application.deploy.client_id}"
    error_message = "the token audience is the deploy registration's own identifier URI, and the bootstrap creates no other registration"
  }

  assert {
    condition     = output.events_identity.audience == data.azuread_application.deploy.client_id && output.events_identity.audience_uri == azuread_application_identifier_uri.events_audience.identifier_uri
    error_message = "the audience is the registration's client ID, the aud of the v1 token the workflows request by that ID; the identifier URI is kept apart"
  }

  assert {
    condition     = output.events_identity.audience != output.events_identity.audience_uri && !startswith(output.events_identity.audience, "api://")
    error_message = "the workflows request the token by client ID, so aud is the client ID, never api://{client ID}, and that is what CDP must trust"
  }

  assert {
    condition     = output.events_identity.issuer == "https://sts.windows.net/00000000-0000-0000-0000-0000000000e3/"
    error_message = "the issuer handed to CDP is the tenant's v1 issuer, with its trailing slash, as a v1 token's iss is"
  }

  assert {
    condition     = output.events_identity.client_id == azurerm_user_assigned_identity.events.client_id && output.events_identity.principal_id == azurerm_user_assigned_identity.events.principal_id
    error_message = "the output carries what CDP and the Environments need: the client ID and the object ID to trust as subject"
  }

  assert {
    condition     = output.events_identity.name == "id-aip-events-infradev"
    error_message = "the output names the events identity"
  }
}

run "refuses_a_deploy_registration_that_issues_v2_tokens" {
  command = plan

  override_data {
    target = data.azuread_application.deploy
    values = {
      id        = "/applications/00000000-0000-0000-0000-000000000001"
      client_id = "00000000-0000-0000-0000-000000000003"
      api = [{
        requested_access_token_version = 2
      }]
    }
  }

  expect_failures = [output.events_identity]
}

run "accepts_a_deploy_registration_left_at_the_default_token_version" {
  command = apply

  override_data {
    target = data.azuread_application.deploy
    values = {
      id        = "/applications/00000000-0000-0000-0000-000000000001"
      client_id = "00000000-0000-0000-0000-000000000003"
      api = [{
        requested_access_token_version = 0
      }]
    }
  }

  assert {
    condition     = output.events_identity.issuer == "https://sts.windows.net/00000000-0000-0000-0000-0000000000e3/"
    error_message = "Entra's default token version is v1, so an unset version plans and hands CDP the v1 issuer"
  }
}

run "refuses_a_third_repository_for_the_events_identity" {
  command = plan

  variables {
    oidc_subject_prefixes = {
      "ai-platform-tenants"     = "repo:DEFRA@1/ai-platform-tenants@2"
      "ai-platform-deployments" = "repo:DEFRA@1/ai-platform-deployments@3"
      "ai-platform-frontend"    = "repo:DEFRA@1/ai-platform-frontend@4"
    }
  }

  expect_failures = [var.oidc_subject_prefixes]
}

run "puts_the_events_identity_in_an_existing_resource_group" {
  command = plan

  variables {
    params_file = "tests/params-existing-resource-group.tfvars.json"
  }

  assert {
    condition     = length(azurerm_resource_group.state) == 0 && azurerm_user_assigned_identity.events.resource_group_name == "SNDAIEAIPRGP1401"
    error_message = "with a resource group made in advance the identity goes into it and bootstrap creates none"
  }
}

run "names_the_events_identity_for_the_longest_environment" {
  command = apply

  variables {
    params_file = "tests/params-longest-environment.tfvars.json"
  }

  assert {
    condition     = azurerm_user_assigned_identity.events.name == "id-aip-events-abcdefghijklmnop" && contains(output.events_federated_subjects, "repo:DEFRA@1/ai-platform-deployments@3:environment:abcdefghijklmnop-events")
    error_message = "a 16-character environment still gives valid names and subjects"
  }
}
