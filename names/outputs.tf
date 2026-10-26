output "environment" {
  value = local.config.environment
}

output "location" {
  value = local.azure.location
}

output "service_code" {
  value = local.config.service_code
}

output "existing_resource_group" {
  description = "Whether the platform and its state use a resource group made in advance."
  value       = try(local.azure.existing_resource_group, null) != null
}

output "names" {
  value = module.naming.names
}

output "team" {
  value = module.naming.team
}

output "federated_credential" {
  description = "Format string for a federated credential trusting a GitHub Environment; format() it with the state repository and the Environment."
  value       = module.naming.federated_credential
}

output "backend" {
  description = "-backend-config values; add key = platform.tfstate, tenants.tfstate or bootstrap.tfstate."
  value = {
    resource_group_name  = module.naming.names.resource_group_state
    storage_account_name = module.naming.names.storage_account_state
    container_name       = module.naming.names.state_container
  }
}

output "ccoe_gaps" {
  value = module.naming.ccoe_gaps
}