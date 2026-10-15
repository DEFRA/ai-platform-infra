# One registration per team per environment (design E). Client secrets are
# created by the Portal API through Graph, never here, and suspension is the
# service principal's accountEnabled, which the Portal API owns.
resource "azuread_application" "this" {
  display_name            = var.display_name
  sign_in_audience        = "AzureADMyOrg"
  owners                  = var.owner_object_ids
  prevent_duplicate_names = true
  notes                   = "AI Platform team ${var.team_slug} in ${var.environment}; managed by the tenants state."

  lifecycle {
    ignore_changes = [password]
  }
}

resource "azuread_service_principal" "this" {
  client_id                    = azuread_application.this.client_id
  owners                       = var.owner_object_ids
  app_role_assignment_required = false

  lifecycle {
    ignore_changes = [account_enabled]
  }
}

resource "azuread_application_federated_identity_credential" "federation" {
  for_each = { for federation in var.federations : federation.name => federation }

  application_id = azuread_application.this.id
  display_name   = each.key
  description    = "Federated workload of AI Platform team ${var.team_slug}."
  issuer         = each.value.issuer
  subject        = each.value.subject
  audiences      = [each.value.audience]
}
