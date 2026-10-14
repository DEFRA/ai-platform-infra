output "names" {
  description = "Every platform resource name for the environment."
  value = merge(local.coded_names, local.logical_names, {
    state_container = "tfstate"
    apim_logger     = "appi-${local.service}"
    diagnostics     = "diag-${local.service}-law"
  })
}

output "team" {
  description = "Format strings for team children; format() them with the team slug (and model slug for deployments)."
  value = {
    project                   = "${local.service}-%s"
    deployment                = "%s-%s"
    api                       = "%s"
    registration              = "app-${local.service}-${var.environment}-%s"
    clients_named_value       = "${local.service}-%s-clients"
    access_window_named_value = "${local.service}-%s-access"
  }
}

output "named_values" {
  description = "Platform named values in API Management."
  value = {
    tenant_id    = "${local.service}-tenant-id"
    api_audience = "${local.service}-api-audience"
    deny_list    = "${local.service}-deny-list"
  }
}

output "fragments" {
  description = "Platform policy fragments in API Management."
  value = {
    authorise = "${local.service}-authorise"
  }
}

output "ccoe_gaps" {
  description = "Resource types named by logical label because CCoE has no type code yet."
  value = [
    "API Management service",
    "Foundry account",
    "Foundry project",
    "Foundry deployment",
    "API Management API, named value and policy fragment",
    "Entra application registration",
  ]
}