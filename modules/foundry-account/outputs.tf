output "id" {
  value = azurerm_cognitive_account.this.id
}

output "name" {
  value = azurerm_cognitive_account.this.name
}

output "location" {
  value = azurerm_cognitive_account.this.location
}

output "openai_endpoint" {
  description = "Base URL the gateway forwards Azure OpenAI calls to."
  value       = "https://${azurerm_cognitive_account.this.custom_subdomain_name}.openai.azure.com"
}