resource "azurerm_key_vault" "this" {
  name                          = var.name
  resource_group_name           = var.resource_group_name
  location                      = var.location
  tenant_id                     = var.tenant_id
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = var.soft_delete_retention_days
  public_network_access_enabled = var.public_network_access
  tags                          = var.tags

  network_acls {
    bypass         = "None"
    default_action = length(var.allowed_ip_ranges) > 0 ? "Deny" : (var.public_network_access ? "Allow" : "Deny")
    ip_rules       = var.allowed_ip_ranges
  }

  lifecycle {
    prevent_destroy = true

    # Azure Policy copies the resource group's ServiceCode tag onto its resources.
    ignore_changes = [tags["ServiceCode"]]
  }
}

resource "azurerm_role_assignment" "this" {
  for_each = var.role_assignments

  scope              = azurerm_key_vault.this.id
  role_definition_id = each.value.role_definition_id
  principal_id       = each.value.principal_id
  principal_type     = "ServicePrincipal"
}