# Groups a team's agents, files and evaluations; it isolates nothing about
# model access, which the gateway enforces (design C #model-access).
resource "azurerm_cognitive_account_project" "this" {
  name                 = var.name
  cognitive_account_id = var.account_id
  location             = var.location
  display_name         = "AI Platform team ${var.team_slug}"
  description          = "Foundry project for AI Platform team ${var.team_slug}; managed by the tenants state."
  tags                 = var.tags

  identity {
    type = "SystemAssigned"
  }
}
