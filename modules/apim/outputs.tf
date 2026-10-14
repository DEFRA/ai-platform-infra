output "id" {
  value = azurerm_api_management.this.id
}

output "name" {
  value = azurerm_api_management.this.name
}

output "gateway_url" {
  value = azurerm_api_management.this.gateway_url
}

output "principal_id" {
  description = "System-assigned identity of the gateway: the only data-plane principal on the Foundry accounts."
  value       = azurerm_api_management.this.identity[0].principal_id
}

output "authorise_fragment" {
  value = azurerm_api_management_policy_fragment.authorise.name
}