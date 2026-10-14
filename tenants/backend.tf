# Partial configuration: the apply workflow passes the state account, the
# container and the key from the names root. Entra ID only; no shared key.
terraform {
  backend "azurerm" {
    use_azuread_auth = true
  }
}
