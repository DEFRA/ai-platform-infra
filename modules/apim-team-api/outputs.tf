output "id" {
  value = azurerm_api_management_api.this.id
}

output "name" {
  value = azurerm_api_management_api.this.name
}

output "path" {
  value = azurerm_api_management_api.this.path
}

output "subscription_required" {
  value = azurerm_api_management_api.this.subscription_required
}

output "named_values" {
  value = local.oauth ? {
    clients       = azurerm_api_management_named_value.clients[0].name
    access_window = azurerm_api_management_named_value.access_window[0].name
  } : null
}

output "policy_xml" {
  description = "The generated policy, for tests and review."
  value       = azurerm_api_management_api_policy.this.xml_content
}