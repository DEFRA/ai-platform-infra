output "environment" {
  value = local.config.environment
}

output "location" {
  value = local.config.location
}

output "service_code" {
  value = local.config.service_code
}

output "names" {
  value = module.naming.names
}

output "team" {
  value = module.naming.team
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