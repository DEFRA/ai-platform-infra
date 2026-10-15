output "id" {
  value = azurerm_api_management_api.this.id
}

output "name" {
  value = azurerm_api_management_api.this.name
}

output "path" {
  value = azurerm_api_management_api.this.path
}

output "named_values" {
  value = {
    clients       = azurerm_api_management_named_value.clients.name
    access_window = azurerm_api_management_named_value.access_window.name
  }
}

output "policy_xml" {
  description = "The generated policy, for tests and review."
  value       = azurerm_api_management_api_policy.this.xml_content
}