resource "azurerm_api_management" "this" {
  name                          = var.name
  resource_group_name           = var.resource_group_name
  location                      = var.location
  publisher_name                = var.publisher_name
  publisher_email               = var.publisher_email
  sku_name                      = "${var.sku}_${var.capacity}"
  public_network_access_enabled = var.public_network_access
  min_api_version               = "2021-08-01"
  tags                          = var.tags

  identity {
    type = "SystemAssigned"
  }

  protocols {
    http2_enabled = true
  }

  security {
    backend_ssl30_enabled  = false
    backend_tls10_enabled  = false
    backend_tls11_enabled  = false
    frontend_ssl30_enabled = false
    frontend_tls10_enabled = false
    frontend_tls11_enabled = false
  }

  timeouts {
    create = "3h"
    update = "3h"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_role_assignment" "telemetry" {
  scope              = var.application_insights_id
  role_definition_id = var.telemetry_role_definition_id
  principal_id       = azurerm_api_management.this.identity[0].principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_api_management_logger" "this" {
  name                = var.names.logger
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  resource_id         = var.application_insights_id

  application_insights {
    connection_string  = var.application_insights_connection_string
    identity_client_id = "SystemAssigned"
  }

  depends_on = [azurerm_role_assignment.telemetry]
}

# azapi because azurerm_api_management_diagnostic does not expose `metrics`,
# which llm-emit-token-metric needs. Bodies are never logged: prompts and
# completions are captured only after a DPIA (design G #audit-capture).
resource "azapi_resource" "diagnostic" {
  type      = "Microsoft.ApiManagement/service/diagnostics@2024-05-01"
  name      = "applicationinsights"
  parent_id = azurerm_api_management.this.id

  body = {
    properties = {
      loggerId                = azurerm_api_management_logger.this.id
      alwaysLog               = "allErrors"
      httpCorrelationProtocol = "W3C"
      verbosity               = "information"
      logClientIp             = false
      metrics                 = true
      operationNameFormat     = "Name"
      sampling = {
        samplingType = "fixed"
        percentage   = var.sampling_percentage
      }
      frontend = {
        request  = { body = { bytes = 0 }, headers = [] }
        response = { body = { bytes = 0 }, headers = [] }
      }
      backend = {
        request  = { body = { bytes = 0 }, headers = [] }
        response = { body = { bytes = 0 }, headers = [] }
      }
    }
  }
}

resource "azurerm_api_management_named_value" "tenant_id" {
  name                = var.names.tenant_id
  display_name        = var.names.tenant_id
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  value               = var.tenant_id
}

resource "azurerm_api_management_named_value" "api_audience" {
  name                = var.names.api_audience
  display_name        = var.names.api_audience
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  value               = coalesce(var.api_audience_client_id, "none")
}

# The emergency deny list is written by the Portal API for a Platform Admin;
# Terraform creates it empty and never changes its value.
resource "azurerm_api_management_named_value" "deny_list" {
  name                = var.names.deny_list
  display_name        = var.names.deny_list
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  value               = "none"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "azurerm_api_management_policy_fragment" "authorise" {
  name              = var.names.authorise
  api_management_id = azurerm_api_management.this.id
  format            = "rawxml"
  description       = "Shared OAuth checks for every team API: token, client list, deny list and access window (design E)."
  value = templatefile("${path.module}/policies/aip-authorise.xml", {
    tenant_id_named_value    = var.names.tenant_id
    api_audience_named_value = var.names.api_audience
    deny_list_named_value    = var.names.deny_list
  })

  depends_on = [
    azurerm_api_management_named_value.tenant_id,
    azurerm_api_management_named_value.api_audience,
    azurerm_api_management_named_value.deny_list,
  ]
}
