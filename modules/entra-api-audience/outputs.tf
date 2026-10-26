output "client_id" {
  value = azuread_application.this.client_id
}

output "identifier_uri" {
  value = azuread_application_identifier_uri.this.identifier_uri
}

output "object_id" {
  value = azuread_application.this.object_id
}

output "application_owners" {
  description = "Owners of the application registration."
  value       = azuread_application.this.owners
}

output "service_principal_owners" {
  description = "Owners of the service principal."
  value       = azuread_service_principal.this.owners
}