# Commented out for the first run, which uses local state because the state
# account does not exist yet; docs/bootstrap.md migrates it afterwards.
# terraform {
#   backend "azurerm" {
#     use_azuread_auth = true
#   }
# }