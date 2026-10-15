# The token audience for every team client in the environment. v2 tokens
# carry azp; the idtyp optional claim marks app-only tokens (design E).
resource "azuread_application" "this" {
  display_name            = var.display_name
  sign_in_audience        = "AzureADMyOrg"
  owners                  = var.owner_object_ids
  prevent_duplicate_names = true
  notes                   = "AI Platform token audience for ${var.environment}; managed by Terraform (ai-platform-infra)."

  api {
    requested_access_token_version = 2
  }

  optional_claims {
    access_token {
      name = "idtyp"
    }
  }
}

resource "azuread_application_identifier_uri" "this" {
  application_id = azuread_application.this.id
  identifier_uri = "api://${azuread_application.this.client_id}"
}

resource "azuread_service_principal" "this" {
  client_id                    = azuread_application.this.client_id
  owners                       = var.owner_object_ids
  app_role_assignment_required = false
}