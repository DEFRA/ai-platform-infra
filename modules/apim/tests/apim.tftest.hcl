mock_provider "azurerm" {
  mock_resource "azurerm_api_management" {
    defaults = {
      id          = "/subscriptions/0/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.ApiManagement/service/apim-aip-infradev"
      gateway_url = "https://apim-aip-infradev.azure-api.net"
      identity    = [{ principal_id = "00000000-0000-0000-0000-000000000009", tenant_id = "00000000-0000-0000-0000-000000000000", type = "SystemAssigned" }]
    }
  }
}

mock_provider "azapi" {}

variables {
  name                                   = "apim-aip-infradev"
  resource_group_name                    = "SNDAIPINFRGP1401"
  location                               = "uksouth"
  sku                                    = "Developer"
  capacity                               = 1
  publisher_name                         = "AI Platform"
  publisher_email                        = "ai-platform@example.test"
  public_network_access                  = true
  application_insights_id                = "/subscriptions/0/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.Insights/components/SNDAIPAPPAIS1401"
  application_insights_connection_string = "InstrumentationKey=00000000-0000-0000-0000-000000000000"
  tenant_id                              = "00000000-0000-0000-0000-000000000000"
  api_audience_client_id                 = "00000000-0000-0000-0000-000000000012"
  telemetry_role_definition_id           = "/subscriptions/0/providers/Microsoft.Authorization/roleDefinitions/3913510d-42f4-4e42-8a64-420c390055eb"
  tags                                   = { aip-environment = "infradev" }
  names = {
    logger       = "appi-aip"
    tenant_id    = "aip-tenant-id"
    api_audience = "aip-api-audience"
    deny_list    = "aip-deny-list"
    fragments = {
      authorise     = "aip-authorise"
      key_guard     = "aip-key-guard"
      whoami        = "aip-whoami"
      request_model = "aip-request-model"
      backend       = { foundry = "aip-backend-foundry" }
    }
  }
}

run "global_guard_and_shared_fragments" {
  command = plan

  # Design C #model-access: the global policy authorises every API, keyed on
  # the credential tier its own policy declared; nothing declared is OAuth.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy.global.xml_content, "GetValueOrDefault<string>(\"aipCredentialType\", \"oauth\") == \"key\"") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<include-fragment fragment-id=\"aip-key-guard\" />") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<include-fragment fragment-id=\"aip-authorise\" />") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<set-variable name=\"aipAuthorised\" value=\"true\" />")
    )
    error_message = "the global policy runs the key guard for the key tier and aip-authorise for everything else, then marks the call authorised"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy.global.xml_content, "<forward-request timeout=\"300\" buffer-response=\"false\" />")
    error_message = "forwarding is configured once, globally"
  }

  assert {
    condition     = toset([for key, fragment in azurerm_api_management_policy_fragment.shared : fragment.name]) == toset(["aip-key-guard", "aip-whoami", "aip-request-model", "aip-backend-foundry"])
    error_message = "the shared fragments take their names from the naming module"
  }

  assert {
    condition     = alltrue([for key, fragment in azurerm_api_management_policy_fragment.shared : fragment.format == "rawxml" && startswith(trimspace(fragment.value), "<fragment>")])
    error_message = "every shared fragment is raw XML with a fragment root"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.shared["request_model"].value, "{\"code\":\"not-authorised\"}") && strcontains(azurerm_api_management_policy_fragment.shared["request_model"].value, "ContainsKey(\"aipAuthorised\")")
    error_message = "the request step refuses to route a call the global guard did not authorise"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.shared["backend_foundry"].value, "<authentication-managed-identity resource=\"https://cognitiveservices.azure.com\" />") && strcontains(azurerm_api_management_policy_fragment.shared["backend_foundry"].value, "<set-header name=\"Authorization\" exists-action=\"delete\" />")
    error_message = "the Foundry backend fragment authenticates as the gateway and strips the caller's credentials"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.authorise.value, "GetValueOrDefault<string>(\"aipClients\", \"\")") && strcontains(azurerm_api_management_policy_fragment.authorise.value, "GetValueOrDefault<string>(\"aipAccess\", \"\")")
    error_message = "aip-authorise grants no client to an API that declared none"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.shared["key_guard"].value, "{\"code\":\"subscription-expired\"}")
    error_message = "the key guard refuses a subscription past its end date (design C)"
  }
}

run "refuses_names_without_the_foundry_backend_fragment" {
  command = plan

  variables {
    names = {
      logger       = "appi-aip"
      tenant_id    = "aip-tenant-id"
      api_audience = "aip-api-audience"
      deny_list    = "aip-deny-list"
      fragments = {
        authorise     = "aip-authorise"
        key_guard     = "aip-key-guard"
        whoami        = "aip-whoami"
        request_model = "aip-request-model"
        backend       = {}
      }
    }
  }

  expect_failures = [var.names]
}
