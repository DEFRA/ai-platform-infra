# Every platform resource sends all logs and metrics to the workspace from
# its first apply (design G, B15). One place, so nothing is missed.

locals {
  diagnostic_targets = merge(
    {
      api_management     = { id = module.apim.id, dedicated = true }
      key_vault_platform = { id = module.key_vault["platform"].id, dedicated = false }
      key_vault_tenants  = { id = module.key_vault["tenants"].id, dedicated = false }
    },
    { for region, account in module.foundry : "foundry_${region}" => { id = account.id, dedicated = false } },
  )
}

resource "azurerm_monitor_diagnostic_setting" "resource" {
  for_each = local.diagnostic_targets

  name                           = local.names.diagnostics
  target_resource_id             = each.value.id
  log_analytics_workspace_id     = module.log_analytics.workspace_id
  log_analytics_destination_type = each.value.dedicated ? "Dedicated" : null

  enabled_log {
    category_group = "allLogs"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_diagnostic_setting" "activity_log" {
  count = var.azure.log_analytics.subscription_activity_log ? 1 : 0

  name                       = local.names.diagnostics
  target_resource_id         = "/subscriptions/${data.azurerm_client_config.current.subscription_id}"
  log_analytics_workspace_id = module.log_analytics.workspace_id

  dynamic "enabled_log" {
    for_each = [
      "Administrative", "Security", "ServiceHealth", "Alert",
      "Recommendation", "Policy", "Autoscale", "ResourceHealth",
    ]

    content {
      category = enabled_log.value
    }
  }
}