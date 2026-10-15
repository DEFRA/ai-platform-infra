resource "azurerm_cognitive_deployment" "this" {
  name                   = var.name
  cognitive_account_id   = var.account_id
  version_upgrade_option = "NoAutoUpgrade"

  model {
    format  = var.model.format
    name    = var.model.name
    version = var.model.version
  }

  sku {
    name     = var.sku
    capacity = var.capacity
  }
}
