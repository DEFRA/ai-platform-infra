data "azurerm_client_config" "current" {}

module "naming" {
  source = "../modules/naming"

  environment     = var.environment
  codes           = local.codes
  location        = var.location
  foundry_regions = var.foundry_regions
}

module "roles" {
  source = "../modules/roles"
}

locals {
  codes  = merge(var.naming, { service_code = var.service_code })
  names  = module.naming.names
  roles  = module.roles.ids
  public = var.network.mode == "public-minimal"

  tags = {
    aip-environment  = var.environment
    aip-owner        = "ai-platform"
    aip-release      = var.release
    aip-service-code = var.service_code
    aip-state        = "platform"
  }
}

resource "azurerm_resource_group" "platform" {
  name     = local.names.resource_group_platform
  location = var.location
  tags     = local.tags
}

module "log_analytics" {
  source = "../modules/log-analytics"

  workspace_name            = local.names.log_analytics_workspace
  application_insights_name = local.names.application_insights
  resource_group_name       = azurerm_resource_group.platform.name
  location                  = var.location
  retention_in_days         = var.log_analytics.retention_in_days
  daily_quota_gb            = var.log_analytics.daily_quota_gb
  sampling_percentage       = var.application_insights.sampling_percentage
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
  resource_group_name                    = azurerm_resource_group.platform.name
  location                               = var.location
  sku                                    = var.apim.sku
  capacity                               = var.apim.capacity
  publisher_name                         = var.apim_publisher.name
  publisher_email                        = var.apim_publisher.email
  public_network_access                  = local.public
  application_insights_id                = module.log_analytics.application_insights_id
  application_insights_connection_string = module.log_analytics.application_insights_connection_string
  sampling_percentage                    = var.application_insights.sampling_percentage
  tenant_id                              = data.azurerm_client_config.current.tenant_id
  api_audience_client_id                 = var.entra_enabled ? module.api_audience[0].client_id : null
  telemetry_role_definition_id           = local.roles.monitoring_metrics_publisher
  tags                                   = local.tags

  names = {
    logger       = local.names.apim_logger
    tenant_id    = module.naming.named_values.tenant_id
    api_audience = module.naming.named_values.api_audience
    deny_list    = module.naming.named_values.deny_list
    authorise    = module.naming.fragments.authorise
  }
}

module "key_vault" {
  source   = "../modules/key-vault"
  for_each = local.key_vaults

  name                       = local.names["key_vault_${each.key}"]
  resource_group_name        = azurerm_resource_group.platform.name
  location                   = var.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days = var.key_vault.soft_delete_retention_days
  public_network_access      = local.public
  role_assignments           = each.value
  tags                       = local.tags
}

locals {
  # Data-plane access per vault: the platform vault serves the gateway, the
  # tenants vault holds the keys and secrets the Portal API creates (design E).
  key_vaults = {
    platform = {
      deploy-secrets-officer = {
        principal_id       = data.azurerm_client_config.current.object_id
        role_definition_id = local.roles.key_vault_secrets_officer
      }
      gateway-secrets-user = {
        principal_id       = module.apim.principal_id
        role_definition_id = local.roles.key_vault_secrets_user
      }
    }
    tenants = {
      portal-api-secrets-officer = {
        principal_id       = var.identities.portal_api_principal_object_id
        role_definition_id = local.roles.key_vault_secrets_officer
      }
    }
  }
}

module "foundry" {
  source   = "../modules/foundry-account"
  for_each = toset(var.foundry_regions)

  name                       = local.names.foundry_accounts[each.key]
  resource_group_name        = azurerm_resource_group.platform.name
  location                   = each.key
  projects_enabled           = each.key == var.foundry_regions[0]
  public_network_access      = local.public
  gateway_principal_id       = module.apim.principal_id
  gateway_role_definition_id = local.roles.foundry_user
  tags                       = local.tags
}