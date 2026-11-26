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

# The gateway billing record (design G #retention): the per-request gateway log and the
# LLM token log are kept as long as the environment sets, never less than the workspace
# searches for. Opt-in per environment because Azure creates these tables only when the
# first log records arrive, so a fresh workspace has none to update: set it once they
# exist. azapi_update_resource because the tables are Azure's own, so there is nothing
# to import, and destroying this leaves the table as it is.
locals {
  billing_record_days   = var.azure.log_analytics.billing_record_retention_days
  billing_record_tables = local.billing_record_days == null ? toset([]) : toset(["ApiManagementGatewayLogs", "ApiManagementGatewayLlmLog"])
  billing_record_total  = local.billing_record_days == null ? null : max(local.billing_record_days, var.azure.log_analytics.retention_in_days)
}

resource "azapi_update_resource" "billing_record_retention" {
  for_each = local.billing_record_tables

  type      = "Microsoft.OperationalInsights/workspaces/tables@2022-10-01"
  name      = each.value
  parent_id = module.log_analytics.workspace_id

  body = {
    properties = {
      totalRetentionInDays = local.billing_record_total
    }
  }

  depends_on = [azurerm_monitor_diagnostic_setting.resource]
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