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
      team_grant    = "aip-team-grant"
      whoami        = "aip-whoami"
      request_model = "aip-request-model"
      backend       = { foundry = "aip-backend-foundry" }
    }
  }
}

run "global_layer_authenticates_by_path_tier" {
  command = plan

  # Design E #enforcement G1: the tier comes from the API's own path against the
  # platform's list, never from a variable a lower policy sets.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy.global.xml_content, "<set-variable name=\"aipTier\" value=\"@(\"research\".Split(',').Contains(context.Api.Path) ? \"key\" : \"oauth\")\" />") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<when condition=\"@((string)context.Variables[\"aipTier\"] == \"key\")\">") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<include-fragment fragment-id=\"aip-key-guard\" />") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<include-fragment fragment-id=\"aip-authorise\" />")
    )
    error_message = "the global policy takes the tier from context.Api.Path and runs the key guard for the key tier and aip-authorise for everything else"
  }

  assert {
    condition     = !strcontains(azurerm_api_management_policy.global.xml_content, "aipCredentialType") && !strcontains(azurerm_api_management_policy.global.xml_content, "aipClients") && !strcontains(azurerm_api_management_policy.global.xml_content, "aipAccess")
    error_message = "the global layer reads nothing a lower policy declares: no credential tier and no team data"
  }

  assert {
    condition = (
      strcontains(azurerm_api_management_policy.global.xml_content, "<set-variable name=\"aipAuthenticated\" value=\"true\" />") &&
      !strcontains(azurerm_api_management_policy.global.xml_content, "aipAuthorised") &&
      index(split("\n", azurerm_api_management_policy.global.xml_content), "    <set-variable name=\"aipAuthenticated\" value=\"true\" />") > index(split("\n", azurerm_api_management_policy.global.xml_content), "      <otherwise>")
    )
    error_message = "the call is marked authenticated only after the tier's guard ran"
  }

  # The gate: only a request a lower layer marked granted is forwarded.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy.global.xml_content, "<when condition=\"@(!context.Variables.ContainsKey(\"aipGrantedCall\"))\">") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<set-body>{\"code\":\"client-not-granted\"}</set-body>") &&
      index(split("\n", azurerm_api_management_policy.global.xml_content), "      <when condition=\"@(!context.Variables.ContainsKey(\"aipGrantedCall\"))\">") < index(split("\n", azurerm_api_management_policy.global.xml_content), "    <forward-request timeout=\"300\" buffer-response=\"false\" />")
    )
    error_message = "the global backend refuses with 403 client-not-granted, before forward-request, any request no lower layer marked granted"
  }

  assert {
    condition     = length(regexall("<forward-request ", azurerm_api_management_policy.global.xml_content)) == 1 && strcontains(azurerm_api_management_policy.global.xml_content, "<forward-request timeout=\"300\" buffer-response=\"false\" />")
    error_message = "forwarding is configured once, globally"
  }

  # A validate-jwt failure runs the global on-error (design E verify 11), which adds the challenge.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy.global.xml_content, "<when condition=\"@(\"validate-jwt\".Equals(context.LastError?.Source))\">") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<set-status code=\"401\" reason=\"Unauthorized\" />") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<set-header name=\"WWW-Authenticate\" exists-action=\"override\">") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "context.LastError.Reason == \"TokenNotPresent\" ? \"Bearer\" : \"Bearer error=\\\"invalid_token\\\"\"") &&
      strcontains(azurerm_api_management_policy.global.xml_content, "<set-body>{\"code\":\"invalid-token\"}</set-body>")
    )
    error_message = "a validate-jwt failure returns 401 invalid-token with WWW-Authenticate (bare for a missing token)"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy.global.xml_content, "<outbound>") && strcontains(azurerm_api_management_policy.global.xml_content, "<set-header name=\"X-Powered-By\" exists-action=\"delete\" />")
    error_message = "response header hygiene stays in the global policy"
  }
}

run "authorise_fragment_is_generic_and_validates_the_token_in_full" {
  command = plan

  # G4: validate-jwt with the tenant's v2 configuration, issuer and audience.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "<validate-jwt header-name=\"Authorization\" require-scheme=\"Bearer\" clock-skew=\"60\" failed-validation-httpcode=\"401\" failed-validation-error-message=\"invalid-token\" output-token-variable-name=\"aipToken\">") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "<openid-config url=\"https://login.microsoftonline.com/{{aip-tenant-id}}/v2.0/.well-known/openid-configuration\" />") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "<issuer>https://login.microsoftonline.com/{{aip-tenant-id}}/v2.0</issuer>") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "<audience>{{aip-api-audience}}</audience>")
    )
    error_message = "validate-jwt requires the Bearer scheme, allows 60 seconds of clock skew, and takes the issuer, audience and keys from the tenant's v2 configuration"
  }

  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "<claim name=\"tid\" match=\"all\">\n        <value>{{aip-tenant-id}}</value>") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "<claim name=\"ver\" match=\"all\">\n        <value>2.0</value>")
    )
    error_message = "the token must carry the tenant's tid and ver 2.0"
  }

  # G5: on the parsed token.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "if (jwt.Algorithm != \"RS256\") { return true; }") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "if (jwt.IssuedAt == null || jwt.ExpirationTime == null) { return true; }") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "if (expires > issuedAt.AddHours(2)) { return true; }") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "if (jwt.Claims.GetValueOrDefault(\"azp\", \"\") == \"\") { return true; }") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "if (azpacr == \"\" || azpacr == \"0\") { return true; }")
    )
    error_message = "the parsed token is refused unless RS256, within 2 hours from iat to exp, with azp and a non-public azpacr"
  }

  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "if (jwt.Claims.GetValueOrDefault(\"idtyp\", \"\") != \"app\") {") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "if (path == \"\" || !\"\".Split(',').Contains(path)) { return true; }")
    )
    error_message = "a non-app token is refused, and with no delegated path configured nothing is excepted, an API with an empty path included"
  }

  # G3 and the 401s.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "context.Request.Headers.ContainsKey(\"Ocp-Apim-Subscription-Key\")") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "context.Request.Url.Query.ContainsKey(\"subscription-key\")") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "context.Request.Headers.GetValueOrDefault(\"Authorization\", \"\").Length >= 8192")
    )
    error_message = "a subscription key on a token path, in the header or the query, and an Authorization header of 8 KB or more are refused"
  }

  assert {
    condition     = length(regexall("<set-header name=\"WWW-Authenticate\" exists-action=\"override\">", azurerm_api_management_policy_fragment.authorise.value)) == 2 && length(regexall("<set-body>\\{\"code\":\"invalid-token\"\\}</set-body>", azurerm_api_management_policy_fragment.authorise.value)) == 2
    error_message = "both refusals the fragment makes itself (G3, G5) are 401 invalid-token with WWW-Authenticate; validate-jwt's own is added by the global on-error"
  }

  # G6.
  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.authorise.value, "\"{{aip-deny-list}}\".Split(',').Contains((string)context.Variables[\"aipClientId\"])") && strcontains(azurerm_api_management_policy_fragment.authorise.value, "{\"code\":\"client-not-granted\"}")
    error_message = "a client on the emergency deny list gets 403 client-not-granted"
  }

  # Generic only, and nothing per request leaves the gateway.
  assert {
    condition = (
      !strcontains(azurerm_api_management_policy_fragment.authorise.value, "aipClients") &&
      !strcontains(azurerm_api_management_policy_fragment.authorise.value, "aipAccess") &&
      !strcontains(azurerm_api_management_policy_fragment.authorise.value, "aipWindow") &&
      !strcontains(azurerm_api_management_policy_fragment.authorise.value, "grant-suspended") &&
      !strcontains(azurerm_api_management_policy_fragment.authorise.value, "grant-expired")
    )
    error_message = "aip-authorise holds no team data and no team rule"
  }

  assert {
    condition = alltrue([
      for xml in [azurerm_api_management_policy_fragment.authorise.value, azurerm_api_management_policy.global.xml_content] :
      !strcontains(xml, "send-request") && !strcontains(xml, "cache-lookup") && !strcontains(xml, "validate-azure-ad-token") && !strcontains(xml, "send-one-way-request")
    ])
    error_message = "authorisation makes no outbound call, cache lookup or Entra-specific validation per request"
  }

  # The fragment is cheapest first: G3, then validate-jwt, then G5, then G6.
  assert {
    condition = (
      index(split("\n", azurerm_api_management_policy_fragment.authorise.value), "      if (context.Request.Headers.ContainsKey(\"Ocp-Apim-Subscription-Key\")) { return true; }") <
      index(split("\n", azurerm_api_management_policy_fragment.authorise.value), "      var jwt = (Jwt)context.Variables[\"aipToken\"];") &&
      strcontains(azurerm_api_management_policy_fragment.authorise.value, "<validate-jwt ") &&
      length(regexall("(?s)ContainsKey\\(\"Ocp-Apim-Subscription-Key\"\\).*<validate-jwt .*var jwt = .*Split\\(','\\).Contains\\(\\(string\\)context.Variables\\[\"aipClientId\"\\]\\)", azurerm_api_management_policy_fragment.authorise.value)) == 1
    )
    error_message = "the header guards run before validate-jwt, the claim checks after it and the deny list last"
  }

  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "context.Variables.GetValueOrDefault<string>(\"aipClients\", \"\")") &&
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "context.Variables.GetValueOrDefault<string>(\"aipAccess\", \"\")")
    )
    error_message = "the team layer grants no client to an API that declared none"
  }
}

run "team_grant_fragment_holds_the_team_checks_only" {
  command = plan

  # T1: the client list, with today's 403 code (AC14).
  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "return string.IsNullOrEmpty(client) || !clients.Contains(client);") &&
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "{\"code\":\"client-not-granted\"}")
    )
    error_message = "an unlisted client gets 403 client-not-granted"
  }

  # T2: the access window, with today's codes, and whoami exempt.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "if (now >= DateTimeOffset.Parse(parts[3])) { return \"grant-expired\"; }") &&
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "if (parts[1] != \"active\") { return \"grant-suspended\"; }") &&
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "if (parts[3] == \"untilRevoked\") { return \"ok\"; }") &&
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "<when condition=\"@(context.Operation.Id != \"whoami\")\">") &&
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "@(\"{\\\"code\\\":\\\"\" + (string)context.Variables[\"aipWindow\"] + \"\\\"}\")")
    )
    error_message = "a suspended or expired window gets 403 grant-suspended or grant-expired; an unlimited window passes; whoami reports the window without refusing"
  }

  # The team layer authenticates nothing and holds no global data.
  assert {
    condition = (
      !strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "validate-jwt") &&
      !strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "aipToken") &&
      !strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "deny") &&
      !strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "{{")
    )
    error_message = "aip-team-grant authenticates nothing and reads no named value: the team policy hands it the data"
  }

  assert {
    condition     = azurerm_api_management_policy_fragment.shared["team_grant"].name == "aip-team-grant"
    error_message = "the team layer fragment takes its name from the naming module"
  }
}

run "shared_fragments" {
  command = plan

  assert {
    condition     = toset([for key, fragment in azurerm_api_management_policy_fragment.shared : fragment.name]) == toset(["aip-key-guard", "aip-team-grant", "aip-whoami", "aip-request-model", "aip-backend-foundry"])
    error_message = "the shared fragments take their names from the naming module"
  }

  assert {
    condition     = alltrue([for key, fragment in azurerm_api_management_policy_fragment.shared : fragment.format == "rawxml" && startswith(trimspace(fragment.value), "<fragment>")]) && azurerm_api_management_policy_fragment.authorise.format == "rawxml" && startswith(trimspace(azurerm_api_management_policy_fragment.authorise.value), "<fragment>")
    error_message = "every fragment is raw XML with a fragment root"
  }

  assert {
    condition     = output.fragments == { team_grant = "aip-team-grant", whoami = "aip-whoami", request_model = "aip-request-model", backend = { foundry = "aip-backend-foundry" } }
    error_message = "the module publishes the fragments a team API includes"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.shared["request_model"].value, "{\"code\":\"not-authorised\"}") && strcontains(azurerm_api_management_policy_fragment.shared["request_model"].value, "ContainsKey(\"aipAuthenticated\")") && !strcontains(azurerm_api_management_policy_fragment.shared["request_model"].value, "aipAuthorised")
    error_message = "the request step refuses to route a call the global layer did not authenticate"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.shared["backend_foundry"].value, "<authentication-managed-identity resource=\"https://cognitiveservices.azure.com\" />") && strcontains(azurerm_api_management_policy_fragment.shared["backend_foundry"].value, "<set-header name=\"Authorization\" exists-action=\"delete\" />")
    error_message = "the Foundry backend fragment authenticates as the gateway and strips the caller's credentials"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.shared["key_guard"].value, "{\"code\":\"subscription-expired\"}")
    error_message = "the key guard refuses a subscription past its end date (design C)"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.shared["whoami"].value, "GetValueOrDefault<string>(\"aipTier\", \"oauth\")") && !strcontains(azurerm_api_management_policy_fragment.shared["whoami"].value, "aipCredentialType")
    error_message = "whoami reports the tier the global layer took from the path, not one a team declared"
  }

  # INF-1: whoami fails closed like a model call. A team policy that does not include the
  # team layer (an old one, between the platform and tenants applies) never marks the
  # caller, so whoami refuses it before it names the team or its grants.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.shared["whoami"].value, "<when condition=\"@(!context.Variables.ContainsKey(\"aipCallerGranted\"))\">") &&
      strcontains(azurerm_api_management_policy_fragment.shared["whoami"].value, "<set-body>{\"code\":\"client-not-granted\"}</set-body>") &&
      index(split("\n", azurerm_api_management_policy_fragment.shared["whoami"].value), "        <when condition=\"@(!context.Variables.ContainsKey(\"aipCallerGranted\"))\">") <
      index(split("\n", azurerm_api_management_policy_fragment.shared["whoami"].value), "      <return-response>")
    )
    error_message = "whoami returns 403 client-not-granted before it builds its answer, unless a lower layer marked the caller"
  }

  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.shared["team_grant"].value, "<set-variable name=\"aipCallerGranted\" value=\"true\" />") &&
      index(split("\n", azurerm_api_management_policy_fragment.shared["team_grant"].value), "  <set-variable name=\"aipCallerGranted\" value=\"true\" />") > index(split("\n", azurerm_api_management_policy_fragment.shared["team_grant"].value), "        <set-body>{\"code\":\"client-not-granted\"}</set-body>")
    )
    error_message = "the team layer marks the caller only after T1 refused an unlisted client"
  }

  # INF-2 and INF-5 (AC15, build-stories.md:992): a token on the Research path is refused by policy with the existing invalid-token code, and a call there is a key or a token, never both.
  assert {
    condition = (
      strcontains(azurerm_api_management_policy_fragment.shared["key_guard"].value, "<when condition=\"@(context.Request.Headers.ContainsKey(\"Authorization\"))\">") &&
      strcontains(azurerm_api_management_policy_fragment.shared["key_guard"].value, "<set-body>{\"code\":\"invalid-token\"}</set-body>") &&
      !strcontains(azurerm_api_management_policy_fragment.shared["key_guard"].value, "invalid-credential") &&
      !strcontains(azurerm_api_management_policy_fragment.shared["key_guard"].value, "WWW-Authenticate") &&
      index(split("\n", azurerm_api_management_policy_fragment.shared["key_guard"].value), "    <when condition=\"@(context.Request.Headers.ContainsKey(\"Authorization\"))\">") <
      index(split("\n", azurerm_api_management_policy_fragment.shared["key_guard"].value), "        <set-body>{\"code\":\"subscription-expired\"}</set-body>")
    )
    error_message = "the key guard refuses any Authorization header with 401 invalid-token (no new code, no bearer challenge) before it checks the subscription"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.shared["key_guard"].value, "<set-variable name=\"aipCallerGranted\" value=\"true\" />") && index(split("\n", azurerm_api_management_policy_fragment.shared["key_guard"].value), "  <set-variable name=\"aipCallerGranted\" value=\"true\" />") > index(split("\n", azurerm_api_management_policy_fragment.shared["key_guard"].value), "        <set-body>{\"code\":\"subscription-expired\"}</set-body>")
    error_message = "the key guard marks the caller only after the subscription passed, so research whoami still answers"
  }
}

run "key_tier_and_delegated_paths_are_configurable" {
  command = plan

  variables {
    key_tier_paths  = ["research", "bulk-research"]
    delegated_paths = ["dev-sandbox"]
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy.global.xml_content, "\"research,bulk-research\".Split(',').Contains(context.Api.Path)")
    error_message = "every key-tier path is on the list the global policy checks"
  }

  assert {
    condition     = strcontains(azurerm_api_management_policy_fragment.authorise.value, "!\"dev-sandbox\".Split(',').Contains(path)")
    error_message = "a delegated path is the only exception to the app-only token rule"
  }
}

run "refuses_an_empty_key_tier_list" {
  command = plan

  variables {
    key_tier_paths = []
  }

  expect_failures = [var.key_tier_paths]
}

run "refuses_a_key_tier_path_that_could_break_the_expression" {
  command = plan

  variables {
    key_tier_paths = ["research\".Split(',').Contains(\"x"]
  }

  expect_failures = [var.key_tier_paths]
}

run "refuses_an_upper_case_or_slashed_key_tier_path" {
  command = plan

  variables {
    key_tier_paths = ["Research/v1"]
  }

  expect_failures = [var.key_tier_paths]
}

run "refuses_a_duplicate_key_tier_path" {
  command = plan

  variables {
    key_tier_paths = ["research", "research"]
  }

  expect_failures = [var.key_tier_paths]
}

run "refuses_a_delegated_path_that_is_a_key_tier_path" {
  command = plan

  variables {
    delegated_paths = ["research"]
  }

  expect_failures = [var.delegated_paths]
}

run "refuses_a_malformed_delegated_path" {
  command = plan

  variables {
    delegated_paths = ["dev sandbox"]
  }

  expect_failures = [var.delegated_paths]
}

run "refuses_a_duplicate_delegated_path" {
  command = plan

  variables {
    delegated_paths = ["dev-sandbox", "dev-sandbox"]
  }

  expect_failures = [var.delegated_paths]
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
        team_grant    = "aip-team-grant"
        whoami        = "aip-whoami"
        request_model = "aip-request-model"
        backend       = {}
      }
    }
  }

  expect_failures = [var.names]
}
