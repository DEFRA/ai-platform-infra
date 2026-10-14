mock_provider "azurerm" {}
mock_provider "azuread" {
  mock_data "azuread_application" {
    defaults = {
      id = "/applications/00000000-0000-0000-0000-000000000001"
    }
  }
}

variables {
  config_files = [
    "../examples/ai-platform-environments/global.tfvars.json",
    "../examples/ai-platform-environments/environments/infradev/platform.tfvars.json",
  ]
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
    config_files = [
      "../examples/ai-platform-environments/global.tfvars.json",
      "../examples/ai-platform-environments/environments/infradev/platform.tfvars.json",
      "tests/existing-resource-group.tfvars.json",
    ]
  }

  assert {
    condition     = length(azurerm_resource_group.state) == 0 && azurerm_storage_account.state.resource_group_name == "SNDAIEAIPRGP1401"
    error_message = "the state account goes into the existing resource group, which bootstrap does not create"
  }

  assert {
    condition     = endswith(azurerm_role_assignment.deploy_rbac_administrator[0].scope, "/resourceGroups/SNDAIEAIPRGP1401")
    error_message = "role administration is scoped to the existing resource group"
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
