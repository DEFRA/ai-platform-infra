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
  description = "What the Environments and CDP need to publish status events. Set client_id as AIP_EVENTS_CLIENT_ID and audience as AIP_EVENTS_AUDIENCE in both Environments of both state repositories. Give CDP the tenant, the audience and principal_id: audience is the registration's client ID, which is the aud claim of the v2 access token the workflow presents, and principal_id is the object ID its IAM role trusts as subject. audience_uri is the registration's identifier URI, another resource value that requests the same token."
  value = {
    name          = azurerm_user_assigned_identity.events.name
    client_id     = azurerm_user_assigned_identity.events.client_id
    principal_id  = azurerm_user_assigned_identity.events.principal_id
    tenant_id     = azurerm_user_assigned_identity.events.tenant_id
    audience_name = local.names.events_audience_app
    audience      = module.events_audience.client_id
    audience_uri  = module.events_audience.identifier_uri
  }
}