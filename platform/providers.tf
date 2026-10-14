provider "azurerm" {
  storage_use_azuread = true

  # azurerm 5 registers nothing by default; register only what the platform uses.
  resource_providers_to_register = [
    "Microsoft.ApiManagement",
    "Microsoft.CognitiveServices",
    "Microsoft.Insights",
    "Microsoft.KeyVault",
    "Microsoft.OperationalInsights",
  ]

  features {}
}

provider "azapi" {}

provider "azuread" {}