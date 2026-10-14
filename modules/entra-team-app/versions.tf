terraform {
  required_version = ">= 1.16.0, < 2.0.0"

  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = ">= 3.10.0, < 4.0.0"
    }
  }
}
