terraform {
  required_version = ">= 1.16.0, < 2.0.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "5.9.0"
    }
    azapi = {
      source  = "Azure/azapi"
      version = "2.13.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "3.10.0"
    }
  }

  # Partial configuration: the apply workflow passes the state account, the
  # container and the key from the names root. Entra ID only; no shared key.
  backend "azurerm" {
    use_azuread_auth = true
  }
}