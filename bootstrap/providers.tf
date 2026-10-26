provider "azurerm" {
  storage_use_azuread = true

  resource_providers_to_register = [
    "Microsoft.ApiManagement",
    "Microsoft.CognitiveServices",
    "Microsoft.Insights",
    "Microsoft.KeyVault",
    "Microsoft.ManagedIdentity",
    "Microsoft.OperationalInsights",
    "Microsoft.Storage",
  ]

  features {}
}

provider "azuread" {}
