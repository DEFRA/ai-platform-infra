# Built-in Azure roles the platform assigns: the only place a role GUID
# appears (Azure built-in roles, checked 13 October 2026).

data "azurerm_subscription" "current" {}

locals {
  guids = {
    contributor                   = "b24988ac-6180-42a0-ab88-20f7382dd24c"
    foundry_user                  = "53ca6127-db72-4b80-b1b0-d745d6d5456d"
    key_vault_secrets_officer     = "b86a8fe4-44ce-4948-aee5-eccb2c155cd7"
    key_vault_secrets_user        = "4633458b-17de-408a-b874-0445c86b69e6"
    monitoring_metrics_publisher  = "3913510d-42f4-4e42-8a64-420c390055eb"
    rbac_administrator            = "f58310d9-a9f6-439a-9e8d-f62e7b41a168"
    storage_blob_data_contributor = "ba92f5b4-2d11-453d-a403-e96b0029c9fe"
    user_access_administrator     = "18d7d88d-d35e-4fb5-a5c3-7773c20a72d9"
  }

  # The data-plane roles the deploy identity may assign (bootstrap ABAC).
  delegable = [
    "foundry_user",
    "key_vault_secrets_officer",
    "key_vault_secrets_user",
    "monitoring_metrics_publisher",
  ]
}