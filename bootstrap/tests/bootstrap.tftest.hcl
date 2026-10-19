mock_provider "azurerm" {}
mock_provider "azuread" {
  mock_data "azuread_application" {
    defaults = {
      id = "/applications/00000000-0000-0000-0000-000000000001"
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
