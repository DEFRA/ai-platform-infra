locals {
  # The global guard branches on what the API declares: `key` runs aip-key-guard,
  # anything else the OAuth guard (modules/apim/policies/global.xml).
  key_tier = var.credential_type == "subscription-key"
  declared = local.key_tier ? "key" : "oauth"

  # A team's caller names a catalogue slug, which the policy maps to the
  # team's derived deployment. The research caller names the deployment as
  # the imported spec defines it, so the allow-list is checked on that raw
  # name and it is forwarded as sent: nothing translates it.
  routes = [
    for model in var.models : merge(model, {
      match   = local.key_tier ? model.deployment_name : model.slug
      forward = local.key_tier ? "@((string)context.Variables[\"aipRequested\"])" : model.deployment_name
    })
  ]

  # A team's limits are shared by its API. On the research API every person
  # has a separate allowance, so the counters are the caller's subscription.
  counter_key = local.key_tier ? "context.Subscription.Id" : "context.Api.Id"

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
  name                = var.api_name
  api_management_name = var.api_management.name
  resource_group_name = var.api_management.resource_group_name
  revision            = "1"
  display_name        = "AI Platform team ${var.team_slug}"
  path                = var.api_name
  protocols           = ["https"]

  # A team API takes a token and never a key. The research API requires an
  # API-scoped subscription. Terraform creates no azurerm_api_management_subscription:
  # those are the backend's, minted per person through ARM, and a Terraform one
  # would fight the backend on every apply.
  subscription_required = local.key_tier
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

# The OAuth tier's facts: the clients the guard admits and the access window.
# A key API has neither, because API Management matches its subscription itself.
resource "azurerm_api_management_named_value" "clients" {
  count = local.key_tier ? 0 : 1

  name                = var.named_values.clients
  display_name        = var.named_values.clients
  api_management_name = var.api_management.name
  resource_group_name = var.api_management.resource_group_name
  value               = length(var.client_ids) > 0 ? join(",", var.client_ids) : "none"
}

# Access windows are the Portal API's: Terraform creates the value empty and
# never changes it (design E #enforcement).
resource "azurerm_api_management_named_value" "access_window" {
  count = local.key_tier ? 0 : 1

  name                = var.named_values.access_window
  display_name        = var.named_values.access_window
  api_management_name = var.api_management.name
  resource_group_name = var.api_management.resource_group_name
  value               = "none"

  lifecycle {
    ignore_changes = [value]
  }
}

# The count keeps an existing team's named values in place rather than
# replacing them.
moved {
  from = azurerm_api_management_named_value.clients
  to   = azurerm_api_management_named_value.clients[0]
}

moved {
  from = azurerm_api_management_named_value.access_window
  to   = azurerm_api_management_named_value.access_window[0]
}

resource "azurerm_api_management_api_policy" "this" {
  api_name            = azurerm_api_management_api.this.name
  api_management_name = var.api_management.name
  resource_group_name = var.api_management.resource_group_name

  # The API's own facts, then <base /> for the global guard, then the shared
  # steps; only the model routing and the limits are generated per API.
  xml_content = templatefile("${path.module}/policies/team-api.xml", {
    team                = var.team_slug
    credential_type     = local.declared
    clients_named_value = var.named_values.clients
    access_named_value  = var.named_values.access_window
    fragments           = var.fragments
    routes              = local.routes
    hostings            = sort(distinct([for model in var.models : model.hosting]))
    granted             = join(",", [for route in local.routes : route.match])
    counter_key         = local.counter_key
    tokens_per_minute   = var.limits.tokens_per_minute
    requests_per_minute = var.limits.requests_per_minute
  })

  depends_on = [
    azurerm_api_management_api_operation.this,
    azurerm_api_management_named_value.clients,
    azurerm_api_management_named_value.access_window,
  ]
}