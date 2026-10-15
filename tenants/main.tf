data "azurerm_client_config" "current" {}

data "terraform_remote_state" "platform" {
  backend = "azurerm"

  config = {
    resource_group_name  = var.platform_state.resource_group_name
    storage_account_name = var.platform_state.storage_account_name
    container_name       = var.platform_state.container_name
    key                  = var.platform_state.key
    use_azuread_auth     = true
  }
}

locals {
  platform = data.terraform_remote_state.platform.outputs

  catalogue = {
    for file in fileset("${path.module}/../catalogue/models", "*.json") :
    trimsuffix(file, ".json") => jsondecode(file("${path.module}/../catalogue/models/${file}"))
  }

  tags = {
    aip-environment = var.environment
    aip-owner       = "ai-platform"
    aip-release     = var.release
    aip-state       = "tenants"
  }
}

# Blocking, unlike a check block: tenants apply only at the release the
# platform state was applied at (R5). The workflow enforces it first.
resource "terraform_data" "platform_release" {
  input = var.release

  lifecycle {
    precondition {
      condition     = local.platform.release == var.release
      error_message = "The platform state is at ${local.platform.release}; tenants apply only at the release the platform applied (R5)."
    }
  }
}

module "naming" {
  source = "../modules/naming"

  environment     = var.environment
  codes           = local.platform.naming
  location        = local.platform.location
  foundry_regions = local.platform.foundry_regions
}

module "team" {
  source   = "../modules/team"
  for_each = var.teams

  team          = each.value
  source_commit = var.team_sources[each.key]
  environment   = var.environment
  names         = module.naming.team
  catalogue     = local.catalogue
  cdp           = var.cdp
  tags          = local.tags

  registration_enabled = var.team_registrations

  platform = {
    api_management = {
      name                = local.platform.api_management.name
      resource_group_name = local.platform.resource_group_name
      gateway_url         = local.platform.api_management.gateway_url
    }
    foundry_accounts   = local.platform.foundry_accounts
    authorise_fragment = local.platform.authorise_fragment
  }

  owner_object_ids = [
    data.azurerm_client_config.current.object_id,
    local.platform.portal_api_principal_object_id,
  ]
}