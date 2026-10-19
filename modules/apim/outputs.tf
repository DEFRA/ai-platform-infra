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

output "fragments" {
  description = "The shared fragments a team API includes, and the backend fragment per hosting platform."
  value = {
    whoami        = azurerm_api_management_policy_fragment.shared["whoami"].name
    request_model = azurerm_api_management_policy_fragment.shared["request_model"].name
    backend = {
      foundry = azurerm_api_management_policy_fragment.shared["backend_foundry"].name
    }
  }
}

output "global_policy_xml" {
  description = "The global guard, for tests and review."
  value       = azurerm_api_management_policy.global.xml_content
}