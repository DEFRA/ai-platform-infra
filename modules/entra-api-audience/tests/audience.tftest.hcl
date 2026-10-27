mock_provider "azuread" {}

variables {
  display_name     = "api-aip-infradev"
  owner_object_ids = ["00000000-0000-0000-0000-000000000002"]
  environment      = "infradev"
}

run "owns_the_application_and_its_service_principal_by_the_given_identities" {
  command = plan

  assert {
    condition     = azuread_application.this.owners == toset(var.owner_object_ids) && azuread_service_principal.this.owners == toset(var.owner_object_ids)
    error_message = "the application and the service principal are both owned by the identities passed in, so the owner handoff is not lost"
  }

  assert {
    condition     = output.application_owners == toset(var.owner_object_ids) && output.service_principal_owners == toset(var.owner_object_ids)
    error_message = "the owners are exposed so a caller can assert its own wiring"
  }
}

run "owns_them_by_every_identity_listed" {
  command = plan

  variables {
    owner_object_ids = ["00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000003"]
  }

  assert {
    condition     = length(azuread_application.this.owners) == 2 && length(azuread_service_principal.this.owners) == 2
    error_message = "every listed owner owns both resources"
  }
}

run "issues_v2_tokens_that_name_the_client_in_azp_and_mark_app_only_tokens" {
  command = plan

  assert {
    condition     = one(azuread_application.this.api).requested_access_token_version == 2
    error_message = "v2 tokens carry the client ID as aud and azp as the caller"
  }

  assert {
    condition     = one(one(azuread_application.this.optional_claims).access_token).name == "idtyp"
    error_message = "the idtyp claim marks app-only tokens (design E)"
  }

  assert {
    condition     = !azuread_service_principal.this.app_role_assignment_required
    error_message = "a client may take a token for the audience without an assignment: the gateway and CDP check the token, not an assignment"
  }
}
