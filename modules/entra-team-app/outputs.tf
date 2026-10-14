output "client_id" {
  value = azuread_application.this.client_id
}

output "object_id" {
  value = azuread_application.this.object_id
}

output "service_principal_object_id" {
  value = azuread_service_principal.this.object_id
}
