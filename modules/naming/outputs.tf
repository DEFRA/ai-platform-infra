output "names" {
  description = "Every platform resource name for the environment."
  value = merge(local.coded_names, local.existing_groups, local.logical_names, {
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
  description = "Platform policy fragments in API Management: the guards the global policy includes, and the shared steps every team API includes (design C #model-access)."
  value = {
    authorise     = "${local.service}-authorise"
    key_guard     = "${local.service}-key-guard"
    whoami        = "${local.service}-whoami"
    request_model = "${local.service}-request-model"
    backend = {
      foundry = "${local.service}-backend-foundry"
    }
  }
}

output "backends" {
  description = "Format strings for API Management backends by hosting platform; format() them with the region."
  value = {
    foundry = "${local.service}-foundry-%s"
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
    "Custom role definition",
  ]
}