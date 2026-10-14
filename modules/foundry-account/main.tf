resource "azurerm_cognitive_account" "this" {
  name                          = var.name
  resource_group_name           = var.resource_group_name
  location                      = var.location
  kind                          = "AIServices"
  sku_name                      = "S0"
  custom_subdomain_name         = var.name
  local_auth_enabled            = false
  public_network_access_enabled = var.public_network_access
  project_management_enabled    = var.projects_enabled
  tags                          = var.tags

  identity {
    type = "SystemAssigned"
  }

  network_acls {
    default_action = var.public_network_access ? "Allow" : "Deny"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_role_assignment" "gateway" {
  scope              = azurerm_cognitive_account.this.id
  role_definition_id = var.gateway_role_definition_id
  principal_id       = var.gateway_principal_id
  principal_type     = "ServicePrincipal"
}