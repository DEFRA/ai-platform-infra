mock_provider "azurerm" {}

mock_provider "time" {}

variables {
  name                = "aip-infradev-apim-subscription-manager"
  resource_group_id   = "/subscriptions/00000000-0000-0000-0000-000000000005/resourceGroups/SNDAIPINFRGP1401"
  api_management_id   = "/subscriptions/00000000-0000-0000-0000-000000000005/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.ApiManagement/service/apim-aip-infradev"
  principal_object_id = "00000000-0000-0000-0000-000000000002"
}

run "grants_exactly_what_the_portal_api_calls" {
  command = plan

  assert {
    condition = toset(azurerm_role_definition.this.permissions[0].actions) == toset([
      "Microsoft.ApiManagement/service/read",
      "Microsoft.ApiManagement/service/subscriptions/read",
      "Microsoft.ApiManagement/service/subscriptions/write",
      "Microsoft.ApiManagement/service/subscriptions/delete",
      "Microsoft.ApiManagement/service/subscriptions/listSecrets/action",
      "Microsoft.ApiManagement/service/subscriptions/regeneratePrimaryKey/action",
      "Microsoft.ApiManagement/service/subscriptions/regenerateSecondaryKey/action",
    ])
    error_message = "the role reads the service and manages subscriptions and their keys"
  }

  assert {
    condition = (
      length(azurerm_role_definition.this.permissions[0].not_actions) == 0 &&
      !anytrue([
        for action in azurerm_role_definition.this.permissions[0].actions :
        strcontains(action, "/apis") || strcontains(action, "/policies") || strcontains(action, "/products") || endswith(action, "*")
      ])
    )
    error_message = "no APIs, policies or products, no wildcard and no NotActions: the gateway's policy is not this role's to change"
  }
}

run "scopes_the_definition_to_the_group_and_the_assignment_to_the_instance" {
  command = plan

  assert {
    condition     = azurerm_role_definition.this.scope == var.resource_group_id && azurerm_role_definition.this.assignable_scopes == tolist([var.resource_group_id])
    error_message = "assignable scopes cannot name a resource, so the definition is scoped to the resource group"
  }

  assert {
    condition     = azurerm_role_assignment.this.scope == var.api_management_id && azurerm_role_assignment.this.principal_type == "ServicePrincipal" && azurerm_role_assignment.this.principal_id == var.principal_object_id
    error_message = "the assignment is narrowed to the API Management instance, for the Portal API's service principal"
  }
}

# Idempotent across repeated applies and a rebuilt state: the IDs derive from
# the name, which carries the environment, never from Azure.
run "derives_deterministic_ids_from_the_environment" {
  command = plan

  assert {
    condition     = azurerm_role_definition.this.role_definition_id == uuidv5("url", "https://github.com/DEFRA/ai-platform-infra/roles/aip-infradev-apim-subscription-manager")
    error_message = "the role definition ID is derived, not Azure-generated"
  }

  assert {
    condition     = azurerm_role_assignment.this.name == uuidv5("url", "https://github.com/DEFRA/ai-platform-infra/role-assignments/aip-infradev-apim-subscription-manager/00000000-0000-0000-0000-000000000002")
    error_message = "the assignment name is derived, so a repeat apply is a no-op rather than a conflict"
  }
}

run "gives_another_environment_another_role" {
  command = plan

  variables {
    name = "aip-sandbox-apim-subscription-manager"
  }

  assert {
    condition     = azurerm_role_definition.this.role_definition_id != uuidv5("url", "https://github.com/DEFRA/ai-platform-infra/roles/aip-infradev-apim-subscription-manager")
    error_message = "a role name is unique per tenant, so each environment has its own definition ID"
  }
}

run "waits_for_the_definition_to_propagate_before_assigning_it" {
  command = plan

  assert {
    condition     = time_sleep.role_definition_propagation.create_duration == "60s"
    error_message = "the wait is explicit rather than a retry"
  }
}

run "refuses_a_principal_that_is_not_a_guid" {
  command = plan

  variables {
    principal_object_id = "portal-api"
  }

  expect_failures = [var.principal_object_id]
}

run "refuses_a_definition_scoped_to_a_resource" {
  command = plan

  variables {
    resource_group_id = "/subscriptions/00000000-0000-0000-0000-000000000005/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.ApiManagement/service/apim-aip-infradev"
  }

  expect_failures = [var.resource_group_id]
}

run "refuses_a_wait_without_a_unit" {
  command = plan

  variables {
    propagation_wait = "60"
  }

  expect_failures = [var.propagation_wait]
}
