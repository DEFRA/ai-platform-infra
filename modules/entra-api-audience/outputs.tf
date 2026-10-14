output "client_id" {
  value = azuread_application.this.client_id
}

output "identifier_uri" {
  value = azuread_application_identifier_uri.this.identifier_uri
}

output "object_id" {
  value = azuread_application.this.object_id
}