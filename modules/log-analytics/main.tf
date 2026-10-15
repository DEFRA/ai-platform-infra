locals {
  access = var.public_network_access ? "Enabled" : "Disabled"
}

resource "azurerm_log_analytics_workspace" "this" {
  name                           = var.workspace_name
  resource_group_name            = var.resource_group_name
  location                       = var.location
  sku                            = "PerGB2018"
  retention_in_days              = var.retention_in_days
  daily_quota_gb                 = var.daily_quota_gb == null ? -1 : var.daily_quota_gb
  local_authentication_enabled   = false
  internet_ingestion_access_type = local.access
  internet_query_access_type     = local.access
  tags                           = var.tags

  lifecycle {
    prevent_destroy = true

    # Azure Policy copies the resource group's ServiceCode tag onto its resources.
    ignore_changes = [tags["ServiceCode"]]
  }
}

resource "azurerm_application_insights" "this" {
  name                         = var.application_insights_name
  resource_group_name          = var.resource_group_name
  location                     = var.location
  workspace_id                 = azurerm_log_analytics_workspace.this.id
  application_type             = "other"
  local_authentication_enabled = false
  internet_ingestion_enabled   = var.public_network_access
  internet_query_enabled       = var.public_network_access
  sampling_percentage          = var.sampling_percentage
  ip_masking_enabled           = true
  tags                         = var.tags

  lifecycle {
    ignore_changes = [tags["ServiceCode"]]
  }
}
