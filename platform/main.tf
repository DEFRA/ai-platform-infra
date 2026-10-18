data "azurerm_client_config" "current" {}

module "naming" {
  source = "../modules/naming"

  environment     = var.environment
  codes           = local.codes
  location        = var.azure.location
  foundry_regions = var.azure.foundry.regions

  existing_resource_group = var.azure.existing_resource_group
}

module "roles" {
  source = "../modules/roles"
}

locals {
  codes  = merge(var.naming, { service_code = var.service_code })
  names  = module.naming.names
  roles  = module.roles.ids
  public = var.azure.network.mode == "public-minimal"

  tags = {
    aip-environment  = var.environment
    aip-owner        = "ai-platform"
    aip-release      = var.release
    aip-service-code = var.service_code
    aip-state        = "platform"
  }
}

resource "azurerm_resource_group" "platform" {
  count = var.azure.existing_resource_group == null ? 1 : 0

  name     = local.names.resource_group_platform
  location = var.azure.location
  tags     = local.tags
}

data "azurerm_resource_group" "existing" {
  count = var.azure.existing_resource_group == null ? 0 : 1

  name = var.azure.existing_resource_group
}

locals {
  resource_group_name = one(concat(
    azurerm_resource_group.platform[*].name,
    data.azurerm_resource_group.existing[*].name,
  ))
}

module "log_analytics" {
  source = "../modules/log-analytics"

  workspace_name            = local.names.log_analytics_workspace
  application_insights_name = local.names.application_insights
  resource_group_name       = local.resource_group_name
  location                  = var.azure.location
  retention_in_days         = var.azure.log_analytics.retention_in_days
  daily_quota_gb            = var.azure.log_analytics.daily_quota_gb
  sampling_percentage       = var.azure.application_insights.sampling_percentage
  public_network_access     = local.public
  tags                      = local.tags
}

module "api_audience" {
  source = "../modules/entra-api-audience"
  count  = var.entra_enabled ? 1 : 0

  display_name     = local.names.api_audience_app
  owner_object_ids = [data.azurerm_client_config.current.object_id]
  environment      = var.environment
}

module "apim" {
  source = "../modules/apim"

  name                                   = local.names.api_management
  resource_group_name                    = local.resource_group_name
  location                               = var.azure.location
  sku                                    = var.azure.apim.sku
  capacity                               = var.azure.apim.capacity
  publisher_name                         = var.azure.apim.publisher.name
  publisher_email                        = var.azure.apim.publisher.email
  public_network_access                  = local.public
  application_insights_id                = module.log_analytics.application_insights_id
  application_insights_connection_string = module.log_analytics.application_insights_connection_string
  sampling_percentage                    = var.azure.application_insights.sampling_percentage
  tenant_id                              = data.azurerm_client_config.current.tenant_id
  api_audience_client_id                 = var.entra_enabled ? module.api_audience[0].client_id : null
  telemetry_role_definition_id           = local.roles.monitoring_metrics_publisher
  tags                                   = local.tags

  names = {
    logger       = local.names.apim_logger
    tenant_id    = module.naming.named_values.tenant_id
    api_audience = module.naming.named_values.api_audience
    deny_list    = module.naming.named_values.deny_list
    fragments    = module.naming.fragments
  }
}

module "key_vault" {
  source   = "../modules/key-vault"
  for_each = local.key_vaults

  name                       = local.names["key_vault_${each.key}"]
  resource_group_name        = local.resource_group_name
  location                   = var.azure.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days = var.azure.key_vault.soft_delete_retention_days
  public_network_access      = local.public
  role_assignments           = each.value
  tags                       = local.tags
}

locals {
  # Data-plane access per vault: the platform vault serves the gateway, the
  # tenants vault holds the keys and secrets the Portal API creates (design E).
  key_vaults = {
    platform = {
      # The identity running this apply: a person on a local run, the deploy
      # identity in a workflow, so Azure infers the principal type.
      deploy-secrets-officer = {
        principal_id       = data.azurerm_client_config.current.object_id
        role_definition_id = local.roles.key_vault_secrets_officer
      }
      gateway-secrets-user = {
        principal_id       = module.apim.principal_id
        role_definition_id = local.roles.key_vault_secrets_user
        principal_type     = "ServicePrincipal"
      }
    }
    tenants = {
      portal-api-secrets-officer = {
        principal_id       = var.azure.identities.portal_api_principal_object_id
        role_definition_id = local.roles.key_vault_secrets_officer
        principal_type     = "ServicePrincipal"
      }
    }
  }
}

module "foundry" {
  source   = "../modules/foundry-account"
  for_each = toset(var.azure.foundry.regions)

  name                       = local.names.foundry_accounts[each.key]
  resource_group_name        = local.resource_group_name
  location                   = each.key
  projects_enabled           = each.key == var.azure.foundry.regions[0]
  public_network_access      = local.public
  gateway_principal_id       = module.apim.principal_id
  gateway_role_definition_id = local.roles.foundry_user
  tags                       = local.tags
}

# One named backend per hosting target; a team API selects it by ID, so
# hosting-specific authentication lives in the platform's fragment for that
# platform, never in a team's policy (design D #gateway).
resource "azurerm_api_management_backend" "foundry" {
  for_each = module.foundry

  name                = format(module.naming.backends.foundry, each.key)
  api_management_name = module.apim.name
  resource_group_name = local.resource_group_name
  protocol            = "http"
  url                 = "https://${each.value.openai_host}"
  description         = "Microsoft Foundry account ${each.value.name} (${each.key})"

  tls {
    validate_certificate_chain = true
    validate_certificate_name  = true
  }
}