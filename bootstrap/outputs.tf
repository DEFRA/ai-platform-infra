output "backend" {
  description = "-backend-config values for every state in this environment."
  value = {
    resource_group_name  = local.names.resource_group_state
    storage_account_name = azurerm_storage_account.state.name
    container_name       = azurerm_storage_container.state.name
  }
}

output "federated_subjects" {
  value = [for credential in azuread_application_federated_identity_credential.deploy : credential.subject]
}

output "events_federated_subjects" {
  description = "The four subjects the events identity trusts: the {env} and {env}-events Environments of both state repositories."
  value       = [for credential in azurerm_federated_identity_credential.events : credential.subject]
}

output "events_identity" {
  description = "What the Environments and CDP need to publish status events. Set client_id as AIP_EVENTS_CLIENT_ID and audience as AIP_EVENTS_AUDIENCE in both Environments of both state repositories. Give CDP the tenant, the audience and principal_id: audience is the deploy identity's registration client ID, which is the aud claim of the v2 access token the workflow presents, and principal_id is the object ID its IAM role trusts as subject. audience_uri is the registration's identifier URI, another resource value that requests the same token."
  value = {
    name         = azurerm_user_assigned_identity.events.name
    client_id    = azurerm_user_assigned_identity.events.client_id
    principal_id = azurerm_user_assigned_identity.events.principal_id
    tenant_id    = azurerm_user_assigned_identity.events.tenant_id
    audience     = data.azuread_application.deploy.client_id
    audience_uri = azuread_application_identifier_uri.events_audience.identifier_uri
  }

  precondition {
    condition     = one(data.azuread_application.deploy.api).requested_access_token_version == 2
    error_message = "The deploy identity's app registration must issue v2 access tokens, so aud is its client ID: set api.requestedAccessTokenVersion to 2 with `az rest --method PATCH` on its Graph application (docs/bootstrap.md, The events identity)."
  }
}