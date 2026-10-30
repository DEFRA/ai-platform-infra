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
  description = "What the Environments and CDP need to publish status events. Set client_id as AIP_EVENTS_CLIENT_ID and audience as AIP_EVENTS_AUDIENCE in both Environments of both state repositories. Give CDP issuer as issuer_url, audience as client_id and principal_id as subject_id: the deploy registration issues v1 access tokens, whose issuer is the tenant's v1 issuer and whose aud is the value the token is requested for, the registration's client ID; a v2 token would carry azp, which AWS STS takes as the audience instead of aud. audience_uri is the registration's identifier URI, which would make aud the URI."
  value = {
    name         = azurerm_user_assigned_identity.events.name
    client_id    = azurerm_user_assigned_identity.events.client_id
    principal_id = azurerm_user_assigned_identity.events.principal_id
    tenant_id    = azurerm_user_assigned_identity.events.tenant_id
    issuer       = "https://sts.windows.net/${azurerm_user_assigned_identity.events.tenant_id}/"
    audience     = data.azuread_application.deploy.client_id
    audience_uri = azuread_application_identifier_uri.events_audience.identifier_uri
  }

  precondition {
    condition     = one(data.azuread_application.deploy.api).requested_access_token_version != 2
    error_message = "The deploy identity's app registration must issue v1 access tokens: a v2 token carries azp, which AWS STS takes as the audience, so CDP's role refuses it. Set api.requestedAccessTokenVersion to 1 with `az rest --method PATCH` on its Graph application (docs/bootstrap.md, The events identity)."
  }
}