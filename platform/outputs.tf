# Read by the tenants root through terraform_remote_state, and published in
# the run report. Nothing sensitive is output.

output "environment" {
  value = var.environment
}

output "release" {
  value = var.release
}

output "resource_group_name" {
  value = local.resource_group_name
}

output "api_management" {
  value = {
    id          = module.apim.id
    name        = module.apim.name
    gateway_url = module.apim.gateway_url
  }
}

output "foundry_accounts" {
  description = "Foundry accounts by region; the primary holds the projects."
  value = {
    for region, account in module.foundry : region => {
      id              = account.id
      name            = account.name
      openai_endpoint = account.openai_endpoint
      primary         = region == var.azure.foundry.regions[0]
    }
  }
}

output "key_vaults" {
  value = { for role, vault in module.key_vault : role => { id = vault.id, name = vault.name } }
}

output "log_analytics_workspace_id" {
  value = module.log_analytics.workspace_id
}

output "application_insights_id" {
  value = module.log_analytics.application_insights_id
}

output "api_audience" {
  description = "Client ID and identifier URI of api-aip-{env}; null when Entra is not enabled."
  value = var.entra_enabled ? {
    client_id      = module.api_audience[0].client_id
    identifier_uri = module.api_audience[0].identifier_uri
  } : null
}

output "authorise_fragment" {
  value = module.apim.authorise_fragment
}

output "naming" {
  description = "The environment's CCoE codes, service code included, for the tenants root's naming module."
  value       = local.codes
}

output "foundry_regions" {
  description = "In configured order: the first holds the projects."
  value       = var.azure.foundry.regions
}

output "location" {
  value = var.azure.location
}

output "portal_api_principal_object_id" {
  description = "Co-owner of every team registration."
  value       = var.azure.identities.portal_api_principal_object_id
}