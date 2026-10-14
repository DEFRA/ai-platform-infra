locals {
  oauth    = var.credential_type == "oauth"
  profiles = toset([for model in var.models : model.api_profile])

  operations = merge(
    {
      whoami = { method = "GET", url = "/whoami", display = "Who am I", deployment = false }
    },
    contains(local.profiles, "chat-completions") ? {
      chat-deployment = { method = "POST", url = "/openai/deployments/{deployment-id}/chat/completions", display = "Chat completions", deployment = true }
      chat-v1         = { method = "POST", url = "/openai/v1/chat/completions", display = "Chat completions (v1)", deployment = false }
    } : {},
    contains(local.profiles, "responses") ? {
      responses    = { method = "POST", url = "/openai/responses", display = "Responses", deployment = false }
      responses-v1 = { method = "POST", url = "/openai/v1/responses", display = "Responses (v1)", deployment = false }
    } : {},
  )
}

resource "azurerm_api_management_api" "this" {
  name                  = var.api_name
  api_management_name   = var.api_management.name
  resource_group_name   = var.api_management.resource_group_name
  revision              = "1"
  display_name          = "AI Platform team ${var.team_slug}"
  path                  = var.api_name
  protocols             = ["https"]
  subscription_required = !local.oauth
}

resource "azurerm_api_management_api_operation" "this" {
  for_each = local.operations

  operation_id        = each.key
  api_name            = azurerm_api_management_api.this.name
  api_management_name = var.api_management.name
  resource_group_name = var.api_management.resource_group_name
  display_name        = each.value.display
  method              = each.value.method
  url_template        = each.value.url

  dynamic "template_parameter" {
    for_each = each.value.deployment ? ["deployment-id"] : []

    content {
      name     = template_parameter.value
      required = true
      type     = "string"
    }
  }
}

resource "azurerm_api_management_named_value" "clients" {
  count = local.oauth ? 1 : 0

  name                = var.named_values.clients
  display_name        = var.named_values.clients
  api_management_name = var.api_management.name
  resource_group_name = var.api_management.resource_group_name
  value               = length(var.client_ids) > 0 ? join(",", var.client_ids) : "none"
}

# Access windows are the Portal API's: Terraform creates the value empty and
# never changes it (design E #enforcement).
resource "azurerm_api_management_named_value" "access_window" {
  count = local.oauth ? 1 : 0

  name                = var.named_values.access_window
  display_name        = var.named_values.access_window
  api_management_name = var.api_management.name
  resource_group_name = var.api_management.resource_group_name
  value               = "none"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_api_management_api_policy" "this" {
  api_name            = azurerm_api_management_api.this.name
  api_management_name = var.api_management.name
  resource_group_name = var.api_management.resource_group_name

  xml_content = templatefile("${path.module}/policies/team-api.xml", {
    team                = var.team_slug
    oauth               = local.oauth
    credential_label    = local.oauth ? "oauth" : "key"
    clients_named_value = var.named_values.clients
    access_named_value  = var.named_values.access_window
    authorise_fragment  = var.authorise_fragment
    models              = var.models
    granted             = join(",", [for model in var.models : "\"${model.slug}\""])
    tokens_per_minute   = var.limits.tokens_per_minute
    requests_per_minute = var.limits.requests_per_minute
  })

  depends_on = [
    azurerm_api_management_api_operation.this,
    azurerm_api_management_named_value.clients,
    azurerm_api_management_named_value.access_window,
  ]
}