output "client_id" {
  value = azuread_application.this.client_id
}

output "object_id" {
  value = azuread_application.this.object_id
}

output "federations" {
  description = "What each federated credential trusts."
  value = {
    for name, federation in azuread_application_federated_identity_credential.federation : name => {
      issuer   = federation.issuer
      subject  = federation.subject
      audience = one(federation.audiences)
    }
  }
}

output "service_principal_object_id" {
  value = azuread_service_principal.this.object_id
}
