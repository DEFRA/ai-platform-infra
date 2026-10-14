provider "azurerm" {
  storage_use_azuread = true

  resource_providers_to_register = [
    "Microsoft.ApiManagement",
    "Microsoft.CognitiveServices",
  ]

  features {}
}

provider "azuread" {}