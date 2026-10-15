mock_provider "azurerm" {
  mock_resource "azurerm_key_vault" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000005/resourceGroups/rg-test/providers/Microsoft.KeyVault/vaults/kvtest"
    }
  }

  # What Azure computes when no principal type is given.
  mock_resource "azurerm_role_assignment" {
    defaults = {
      principal_type = "User"
    }
  }
}

variables {
  name                       = "kvtest"
  resource_group_name        = "rg-test"
  location                   = "uksouth"
  tenant_id                  = "00000000-0000-0000-0000-000000000000"
  soft_delete_retention_days = 7
  public_network_access      = true
  tags                       = {}
}

# A person running a local apply has principal type User, so a type set for
# every assignment makes Azure refuse the one made for the caller.
run "passes_each_assignments_principal_type_through" {
  command = apply

  variables {
    role_assignments = {
      caller = {
        principal_id       = "00000000-0000-0000-0000-000000000001"
        role_definition_id = "/providers/Microsoft.Authorization/roleDefinitions/00000000-0000-0000-0000-0000000000a1"
      }
      gateway = {
        principal_id       = "00000000-0000-0000-0000-000000000002"
        role_definition_id = "/providers/Microsoft.Authorization/roleDefinitions/00000000-0000-0000-0000-0000000000a2"
        principal_type     = "ServicePrincipal"
      }
    }
  }

  # Unset, the provider computes the type; a forced ServicePrincipal would fail
  # for a person's local apply.
  assert {
    condition     = azurerm_role_assignment.this["caller"].principal_type == "User"
    error_message = "an assignment that names no principal type is left to Azure, for the identity running Terraform"
  }

  assert {
    condition     = azurerm_role_assignment.this["gateway"].principal_type == "ServicePrincipal"
    error_message = "an assignment that names a principal type keeps it"
  }
}
