locals {
  # Deterministic, so a state that is rebuilt or a role that is re-created reuses
  # the same ID instead of orphaning the old definition, and a repeat apply is
  # a no-op. Both derive from the role name, which carries the environment, so
  # they are known at plan time.
  role_definition_guid = uuidv5("url", "https://github.com/DEFRA/ai-platform-infra/roles/${var.name}")
  assignment_name      = uuidv5("url", "https://github.com/DEFRA/ai-platform-infra/role-assignments/${var.name}/${var.principal_object_id}")

  # Exactly what the Portal API's ARM adapter calls to mint, reveal, rotate and
  # revoke a research key, and no `apis`, `policies` or `products` action: the
  # narrowest built-in, API Management Service Contributor, is full control of
  # the gateway, including the policy that enforces the research tier. Each
  # exists in `az provider operation show --namespace Microsoft.ApiManagement`
  # (checked 20 October 2026).
  actions = [
    "Microsoft.ApiManagement/service/read",
    "Microsoft.ApiManagement/service/subscriptions/read",
    "Microsoft.ApiManagement/service/subscriptions/write",
    "Microsoft.ApiManagement/service/subscriptions/delete",
    "Microsoft.ApiManagement/service/subscriptions/listSecrets/action",
    "Microsoft.ApiManagement/service/subscriptions/regeneratePrimaryKey/action",
    "Microsoft.ApiManagement/service/subscriptions/regenerateSecondaryKey/action",
  ]
}

resource "azurerm_role_definition" "this" {
  role_definition_id = local.role_definition_guid
  name               = var.name
  scope              = var.resource_group_id
  description        = "Manage API Management subscriptions and read their keys: what the Portal API needs to issue research credentials, and no policy, API or product rights."

  permissions {
    actions     = local.actions
    not_actions = []
  }

  assignable_scopes = [var.resource_group_id]
}

# A new definition is not assignable straight away; wait explicitly rather than
# rely on a retry. Re-runs only when the definition's ID changes.
resource "time_sleep" "role_definition_propagation" {
  create_duration = var.propagation_wait

  triggers = {
    role_definition_id = azurerm_role_definition.this.role_definition_resource_id
  }
}

# Terraform creates no azurerm_api_management_subscription. Subscriptions are
# the backend's, minted per person through ARM against the research API; one
# here would fight the backend on every apply and put a key in state.
resource "azurerm_role_assignment" "this" {
  name               = local.assignment_name
  scope              = var.api_management_id
  role_definition_id = azurerm_role_definition.this.role_definition_resource_id
  principal_id       = var.principal_object_id
  principal_type     = "ServicePrincipal"

  depends_on = [time_sleep.role_definition_propagation]
}
