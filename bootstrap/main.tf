# One-time per subscription, run by a platform engineer with Owner (or
# Contributor and User Access Administrator) and Azure CLI sign-in.
# Runbook: docs/bootstrap.md.

data "azurerm_client_config" "operator" {}

data "azuread_application" "deploy" {
  client_id = var.deploy_client_id
}

data "azuread_service_principal" "deploy" {
  client_id = var.deploy_client_id
}

module "names" {
  source = "../names"

  params_file = var.params_file
}

module "roles" {
  source = "../modules/roles"
}

locals {
  environment     = module.names.environment
  location        = module.names.location
  names           = module.names.names
  roles           = module.roles.ids
  delegable_roles = join(", ", module.roles.delegable_guids)
  subscription_id = "/subscriptions/${data.azurerm_client_config.operator.subscription_id}"

  tags = {
    aip-environment  = local.environment
    aip-owner        = "ai-platform"
    aip-service-code = module.names.service_code
    aip-state        = "bootstrap"
  }
}

resource "azurerm_resource_group" "state" {
  count = module.names.existing_resource_group ? 0 : 1

  name     = local.names.resource_group_state
  location = local.location
  tags     = local.tags
}

# With a resource group made in advance, the deploy identity's role
# administration stays inside it rather than the subscription.
locals {
  rbac_scope = (
    module.names.existing_resource_group
    ? "${local.subscription_id}/resourceGroups/${local.names.resource_group_state}"
    : local.subscription_id
  )
}

# Public endpoint with Entra authentication only, until private runners
# exist (named exception X2); shared keys are off.
resource "azurerm_storage_account" "state" {
  name                              = local.names.storage_account_state
  resource_group_name               = local.names.resource_group_state
  location                          = local.location
  account_tier                      = "Standard"
  account_replication_type          = "ZRS"
  account_kind                      = "StorageV2"
  min_tls_version                   = "TLS1_2"
  shared_access_key_enabled         = false
  default_to_oauth_authentication   = true
  allow_nested_items_to_be_public   = false
  infrastructure_encryption_enabled = true
  public_network_access             = "Enabled"
  tags                              = local.tags

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 30
    }

    container_delete_retention_policy {
      days = 30
    }
  }

  lifecycle {
    prevent_destroy = true

    # Azure Policy copies the resource group's ServiceCode tag onto its resources.
    ignore_changes = [tags["ServiceCode"]]
  }
}

resource "azurerm_storage_container" "state" {
  name                  = local.names.state_container
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"

  lifecycle {
    prevent_destroy = true
  }
}

# Delete locks (direction 18 October 2026). Only Owner or User Access
# Administrator may write a lock, which the deploy identity is not, so the
# operator holds them here. The state account is locked as soon as it exists;
# the platform's vaults and workspace on a second pass, once the first
# platform apply has created them (lock_platform_resources). API Management
# and the Foundry accounts take no lock: every resource under a locked scope
# inherits it, so a lock there would refuse the team APIs, projects and
# deployments the tenants apply removes by design; prevent_destroy and
# plan-guard cover them (docs/bootstrap.md).
resource "azurerm_management_lock" "state_account" {
  name       = "aip-no-delete"
  scope      = azurerm_storage_account.state.id
  lock_level = "CanNotDelete"
  notes      = "Terraform state of the AI Platform; removed only to decommission the environment."
}

data "azurerm_key_vault" "platform" {
  for_each = var.lock_platform_resources ? toset(["key_vault_platform", "key_vault_tenants"]) : toset([])

  name                = local.names[each.key]
  resource_group_name = local.names.resource_group_platform
}

data "azurerm_log_analytics_workspace" "platform" {
  count = var.lock_platform_resources ? 1 : 0

  name                = local.names.log_analytics_workspace
  resource_group_name = local.names.resource_group_platform
}

locals {
  locked_platform_resources = merge(
    { for key, vault in data.azurerm_key_vault.platform : key => vault.id },
    { for workspace in data.azurerm_log_analytics_workspace.platform : "log_analytics_workspace" => workspace.id },
  )
}

resource "azurerm_management_lock" "platform" {
  for_each = local.locked_platform_resources

  name       = "aip-no-delete"
  scope      = each.value
  lock_level = "CanNotDelete"
  notes      = "Core AI Platform resource; its role assignments and diagnostics inherit the lock. Removed only by a platform engineer, deliberately."
}

resource "azurerm_role_assignment" "deploy_state" {
  scope              = azurerm_storage_container.state.id
  role_definition_id = local.roles.storage_blob_data_contributor
  principal_id       = data.azuread_service_principal.deploy.object_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "operator_state" {
  count = var.operator_state_access ? 1 : 0

  scope              = azurerm_storage_container.state.id
  role_definition_id = local.roles.storage_blob_data_contributor
  principal_id       = data.azurerm_client_config.operator.object_id
}

resource "azurerm_role_assignment" "deploy_contributor" {
  count = var.grant_contributor ? 1 : 0

  scope              = local.rbac_scope
  role_definition_id = local.roles.contributor
  principal_id       = data.azuread_service_principal.deploy.object_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "deploy_rbac_administrator" {
  count = var.grant_role_assignment_admin ? 1 : 0

  scope              = local.rbac_scope
  role_definition_id = local.roles.rbac_administrator
  principal_id       = data.azuread_service_principal.deploy.object_id
  principal_type     = "ServicePrincipal"
  condition_version  = "2.0"
  condition          = <<-EOT
    (
     (
      !(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})
     )
     OR
     (
      @Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${local.delegable_roles}}
     )
    )
    AND
    (
     (
      !(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})
     )
     OR
     (
      @Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${local.delegable_roles}}
     )
    )
  EOT
}

# The deploy identity accepts exactly the two state repositories' subjects
# for this environment's GitHub Environment, and nothing else.
resource "azuread_application_federated_identity_credential" "deploy" {
  for_each = var.oidc_subject_prefixes

  application_id = data.azuread_application.deploy.id
  display_name   = "${each.key}-${local.environment}"
  description    = "GitHub Actions in ${each.key}, Environment ${local.environment} only."
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "${each.value}:environment:${local.environment}"
  audiences      = ["api://AzureADTokenExchange"]
}

data "azuread_application_published_app_ids" "well_known" {}

data "azuread_service_principal" "graph" {
  count     = var.grant_graph_application_owned_by ? 1 : 0
  client_id = data.azuread_application_published_app_ids.well_known.result["MicrosoftGraph"]
}

resource "azuread_app_role_assignment" "deploy_graph" {
  count = var.grant_graph_application_owned_by ? 1 : 0

  app_role_id         = data.azuread_service_principal.graph[0].app_role_ids["Application.ReadWrite.OwnedBy"]
  principal_object_id = data.azuread_service_principal.deploy.object_id
  resource_object_id  = data.azuread_service_principal.graph[0].object_id
}