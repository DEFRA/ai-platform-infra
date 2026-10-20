output "role_definition_id" {
  description = "The custom role's definition ID."
  value       = azurerm_role_definition.this.role_definition_resource_id
}
