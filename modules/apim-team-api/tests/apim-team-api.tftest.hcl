mock_provider "azurerm" {}

variables {
  team_slug      = "alpha"
  api_name       = "alpha"
  api_management = { name = "apim-aip-infradev", resource_group_name = "SNDAIPINFRGP1401" }
  named_values   = { clients = "aip-alpha-clients", access_window = "aip-alpha-access" }
  limits         = { tokens_per_minute = 1000, requests_per_minute = 60 }
  client_ids     = ["00000000-0000-0000-0000-000000000011"]
  fragments = {
    team_grant    = "aip-team-grant"
    whoami        = "aip-whoami"
    request_model = "aip-request-model"
    backend       = { foundry = "aip-backend-foundry" }
  }
  models = [{
    slug            = "gpt-5-nano"
    deployment_name = "alpha-gpt-5-nano"
    hosting         = "foundry"
    backend_id      = "aip-foundry-swedencentral"
    api_profile     = "chat-completions"
  }]
}

run "team_policy" {
  command = plan

  assert {
    condition     = !azurerm_api_management_api.this.subscription_required
    error_message = "a team API takes a token, never a subscription key"
  }

  # The global layer authenticates first (<base />). The team's facts follow it,
  # so nothing the global layer reads comes from this policy (design E #enforcement).
  assert {
    condition = (
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-variable name=\"aipClients\" value=\"{{aip-alpha-clients}}\" />") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-variable name=\"aipAccess\" value=\"{{aip-alpha-access}}\" />") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-variable name=\"aipGranted\" value=\"gpt-5-nano\" />")
    )
    error_message = "the policy carries the team's client list, access window and grants"
  }

  assert {
    condition = (
      !strcontains(azurerm_api_management_api_policy.this.xml_content, "aipCredentialType") &&
      !strcontains(azurerm_api_management_api_policy.this.xml_content, "aipAuthorised")
    )
    error_message = "a team policy declares no credential tier: the global layer takes it from the API's path"
  }

  assert {
    condition = alltrue([
      for name in ["aipTeam", "aipClients", "aipAccess", "aipGranted"] :
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <base />") <
      min([for i, line in split("\n", azurerm_api_management_api_policy.this.xml_content) : i if strcontains(line, "<set-variable name=\"${name}\"")]...)
    ])
    error_message = "every team variable is set after <base />, so none flows up into the global layer"
  }

  assert {
    condition = (
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <base />") <
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <include-fragment fragment-id=\"aip-team-grant\" />") &&
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <set-variable name=\"aipAccess\" value=\"{{aip-alpha-access}}\" />") <
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <include-fragment fragment-id=\"aip-team-grant\" />") &&
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <include-fragment fragment-id=\"aip-team-grant\" />") <
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <include-fragment fragment-id=\"aip-whoami\" />") &&
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <include-fragment fragment-id=\"aip-whoami\" />") <
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <include-fragment fragment-id=\"aip-request-model\" />")
    )
    error_message = "the team layer runs after <base />, with its data set first, and whoami answers after it and before any model step"
  }

  assert {
    condition     = length(regexall("<include-fragment fragment-id=\"aip-team-grant\" />", azurerm_api_management_api_policy.this.xml_content)) == 1
    error_message = "the team grant fragment is included once"
  }

  # The gate's mark: set only where the requested model is granted.
  assert {
    condition = (
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<when condition=\"@((string)context.Variables[\"aipRequested\"] == \"gpt-5-nano\")\">\n        <set-variable name=\"aipGrantedCall\" value=\"true\" />") &&
      length(regexall("aipGrantedCall", azurerm_api_management_api_policy.this.xml_content)) == 1 &&
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "        <set-variable name=\"aipGrantedCall\" value=\"true\" />") <
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "      <otherwise>")
    )
    error_message = "a request is marked granted only in the branch of a granted slug; the otherwise branch refuses"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<include-fragment fragment-id=\"aip-request-model\" />") && strcontains(azurerm_api_management_api_policy.this.xml_content, "<include-fragment fragment-id=\"aip-backend-foundry\" />")
    error_message = "the request and backend steps are the platform's fragments, not generated per team"
  }

  assert {
    condition     = !strcontains(azurerm_api_management_api_policy.this.xml_content, "authentication-managed-identity") && !strcontains(azurerm_api_management_api_policy.this.xml_content, "validate-azure-ad-token") && !strcontains(azurerm_api_management_api_policy.this.xml_content, "base-url=")
    error_message = "a team policy carries no authentication of its own and names no backend URL"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-backend-service backend-id=\"aip-foundry-swedencentral\" />")
    error_message = "a granted slug routes to the platform's named backend for its hosting and region"
  }

  assert {
    condition     = azurerm_api_management_named_value.clients[0].value == "00000000-0000-0000-0000-000000000011"
    error_message = "the client list holds the team registration"
  }

  assert {
    condition     = azurerm_api_management_named_value.access_window[0].value == "none"
    error_message = "access windows start empty; the Portal API activates them"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-body>{\"code\":\"model-not-granted\"}</set-body>")
    error_message = "anything not granted returns 403 model-not-granted"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-variable name=\"aipDeployment\" value=\"alpha-gpt-5-nano\" />")
    error_message = "a granted slug maps to the team's derived deployment"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "tokens-per-minute=\"1000\"") && strcontains(azurerm_api_management_api_policy.this.xml_content, "calls=\"60\"")
    error_message = "the team's token and request limits are enforced; tokens-per-minute takes no expression, so they are generated"
  }

  assert {
    condition     = toset(keys(azurerm_api_management_api_operation.this)) == toset(["whoami", "chat-deployment", "chat-v1"])
    error_message = "a chat-completions model exposes its two operations and whoami"
  }

  assert {
    condition = (
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<rate-limit-by-key calls=\"60\" renewal-period=\"60\" counter-key=\"@(context.Api.Id)\" />") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<llm-token-limit counter-key=\"@(context.Api.Id)\"") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<dimension name=\"credentialType\" value=\"oauth\" />")
    )
    error_message = "a team's limits are shared by its API and its metric says oauth"
  }

  assert {
    condition     = output.named_values == { clients = "aip-alpha-clients", access_window = "aip-alpha-access" }
    error_message = "a team API publishes its two named values"
  }

  assert {
    condition     = !strcontains(azurerm_api_management_api_policy.this.xml_content, "set-query-parameter")
    error_message = "a team API takes a token, so it touches no query parameter"
  }

  # A team still reads the slug through the shared fragment and maps it to its derived deployment.
  assert {
    condition = (
      !strcontains(azurerm_api_management_api_policy.this.xml_content, "name=\"aipRequested\" value=\"@{") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "== \"gpt-5-nano\")\">") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-variable name=\"aipDeployment\" value=\"alpha-gpt-5-nano\" />")
    )
    error_message = "the team path translates a slug to the team's deployment, unlike research"
  }
}

run "research_policy" {
  command = plan

  variables {
    team_slug       = "research"
    api_name        = "research"
    credential_type = "subscription-key"
    client_ids      = []
    named_values    = { clients = "aip-research-clients", access_window = "aip-research-access" }
    models = [
      {
        slug            = "gpt-4-1-nano"
        deployment_name = "gpt-4.1-nano"
        hosting         = "foundry"
        backend_id      = "aip-foundry-swedencentral"
        api_profile     = "chat-completions"
      },
      {
        slug            = "gpt-4o"
        deployment_name = "gpt-4o"
        hosting         = "foundry"
        backend_id      = "aip-foundry-uksouth"
        api_profile     = "chat-completions"
      },
    ]
  }

  assert {
    condition     = azurerm_api_management_api.this.subscription_required
    error_message = "the research API requires an API-scoped subscription"
  }

  # The tier is the API's path, taken by the global policy; the API only decides
  # what it requires and carries.
  assert {
    condition = (
      !strcontains(azurerm_api_management_api_policy.this.xml_content, "aipCredentialType") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<dimension name=\"credentialType\" value=\"key\" />") &&
      !strcontains(azurerm_api_management_api_policy.this.xml_content, "value=\"oauth\"")
    )
    error_message = "the key API declares no tier in its policy and says key in its metric"
  }

  assert {
    condition = (
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <base />") <
      index(split("\n", azurerm_api_management_api_policy.this.xml_content), "    <set-variable name=\"aipTeam\" value=\"research\" />") &&
      !strcontains(azurerm_api_management_api_policy.this.xml_content, "<include-fragment fragment-id=\"aip-team-grant\" />")
    )
    error_message = "the key API runs the global layer first and has no team layer: its subscription is the caller"
  }

  assert {
    condition = (
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<when condition=\"@((string)context.Variables[\"aipRequested\"] == \"gpt-4.1-nano\")\">\n        <set-variable name=\"aipGrantedCall\" value=\"true\" />") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<when condition=\"@((string)context.Variables[\"aipRequested\"] == \"gpt-4o\")\">\n        <set-variable name=\"aipGrantedCall\" value=\"true\" />")
    )
    error_message = "the key API marks a request granted for each allowed deployment name, so the global gate forwards it"
  }

  assert {
    condition     = length(azurerm_api_management_named_value.clients) == 0 && length(azurerm_api_management_named_value.access_window) == 0 && output.named_values == null
    error_message = "a key API has no client list or access window"
  }

  assert {
    condition     = !strcontains(azurerm_api_management_api_policy.this.xml_content, "aipClients") && !strcontains(azurerm_api_management_api_policy.this.xml_content, "aipAccess") && !strcontains(azurerm_api_management_api_policy.this.xml_content, "{{")
    error_message = "the key policy reads no named value"
  }

  # No translation: the caller's deployment name is what is allowed and what is forwarded.
  assert {
    condition     = !strcontains(azurerm_api_management_api_policy.this.xml_content, "aip-request-model")
    error_message = "the research path skips aip-request-model"
  }

  assert {
    condition = (
      strcontains(azurerm_api_management_api_policy.this.xml_content, "== \"gpt-4.1-nano\")\">") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "== \"gpt-4o\")\">") &&
      !strcontains(azurerm_api_management_api_policy.this.xml_content, "== \"gpt-4-1-nano\")\">")
    )
    error_message = "the allow-list is checked on the raw deployment name, never on a catalogue slug"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-variable name=\"aipDeployment\" value=\"@((string)context.Variables[\"aipRequested\"])\" />")
    error_message = "the name the caller sent is forwarded as it was sent"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-variable name=\"aipGranted\" value=\"gpt-4.1-nano,gpt-4o\" />")
    error_message = "whoami lists the deployment names a caller can use"
  }

  assert {
    condition = (
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-backend-service backend-id=\"aip-foundry-swedencentral\" />") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-backend-service backend-id=\"aip-foundry-uksouth\" />")
    )
    error_message = "each deployment still routes to the backend of the account that holds it"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-body>{\"code\":\"model-not-granted\"}</set-body>")
    error_message = "anything not allowed returns 403 model-not-granted before any backend call"
  }

  # Each person has a separate allowance (design C #model-access).
  assert {
    condition = (
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<rate-limit-by-key calls=\"60\" renewal-period=\"60\" counter-key=\"@(context.Subscription.Id)\" />") &&
      strcontains(azurerm_api_management_api_policy.this.xml_content, "<llm-token-limit counter-key=\"@(context.Subscription.Id)\"") &&
      !strcontains(azurerm_api_management_api_policy.this.xml_content, "context.Api.Id")
    )
    error_message = "the limits are counted per subscription, not per API"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<include-fragment fragment-id=\"aip-whoami\" />") && strcontains(azurerm_api_management_api_policy.this.xml_content, "<include-fragment fragment-id=\"aip-backend-foundry\" />")
    error_message = "whoami and the backend step are still the platform's fragments"
  }

  # The key also arrives as the default subscription-key query parameter, which the backend fragment does not remove.
  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-query-parameter name=\"subscription-key\" exists-action=\"delete\" />")
    error_message = "a key sent in the query string is not forwarded to the backend"
  }
}

run "client_list_is_the_team_layer_data" {
  command = plan

  variables {
    client_ids = [
      "00000000-0000-0000-0000-000000000011",
      "00000000-0000-0000-0000-000000000012",
    ]
  }

  assert {
    condition     = azurerm_api_management_named_value.clients[0].value == "00000000-0000-0000-0000-000000000011,00000000-0000-0000-0000-000000000012"
    error_message = "every listed client is on the comma-separated list the team layer checks; adding a client changes data, not policy"
  }

  assert {
    condition     = !strcontains(azurerm_api_management_api_policy.this.xml_content, "00000000-0000-0000-0000-00000000001")
    error_message = "no client ID is written into the policy text"
  }
}

run "a_team_with_no_clients_grants_none" {
  command = plan

  variables {
    client_ids = []
  }

  assert {
    condition     = azurerm_api_management_named_value.clients[0].value == "none"
    error_message = "an empty client list renders none, which matches no client ID"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-variable name=\"aipClients\" value=\"{{aip-alpha-clients}}\" />") && strcontains(azurerm_api_management_api_policy.this.xml_content, "<include-fragment fragment-id=\"aip-team-grant\" />")
    error_message = "the team layer still runs, so the empty list refuses every caller"
  }
}

run "refuses_an_unknown_credential_type" {
  command = plan

  variables {
    credential_type = "api-key"
  }

  expect_failures = [var.credential_type]
}

run "refuses_more_than_forty_clients" {
  command = plan

  variables {
    client_ids = [for i in range(41) : format("00000000-0000-0000-0000-%012d", i)]
  }

  expect_failures = [var.client_ids]
}

run "refuses_a_model_on_a_hosting_platform_without_a_fragment" {
  command = plan

  variables {
    models = [{
      slug            = "claude-sonnet"
      deployment_name = "alpha-claude-sonnet"
      hosting         = "bedrock"
      backend_id      = "aip-bedrock-eu-west-2"
      api_profile     = "chat-completions"
    }]
  }

  expect_failures = [var.models]
}

run "a_team_with_no_grants_refuses_every_model" {
  command = plan

  variables {
    models = []
  }

  assert {
    condition     = !strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-backend-service") && !strcontains(azurerm_api_management_api_policy.this.xml_content, "aipGrantedCall")
    error_message = "with no grants there is nothing to route to, and nothing is ever marked granted"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "model-not-granted") && strcontains(azurerm_api_management_api_policy.this.xml_content, "<set-variable name=\"aipGranted\" value=\"\" />")
    error_message = "with no grants every request is refused and whoami lists none"
  }

  assert {
    condition     = !strcontains(azurerm_api_management_api_policy.this.xml_content, "aip-backend-foundry")
    error_message = "no backend fragment is included for a hosting the team does not use"
  }
}
