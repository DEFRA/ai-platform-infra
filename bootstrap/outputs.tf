output "backend" {
  description = "-backend-config values for every state in this environment."
  value = {
    resource_group_name  = local.names.resource_group_state
    storage_account_name = azurerm_storage_account.state.name
    container_name       = azurerm_storage_container.state.name
  }
}

output "federated_subjects" {
  value = [for credential in azuread_application_federated_identity_credential.deploy : credential.subject]
}