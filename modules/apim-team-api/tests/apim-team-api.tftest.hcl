mock_provider "azurerm" {}

variables {
  team_slug          = "alpha"
  api_name           = "alpha"
  api_management     = { name = "apim-aip-infradev", resource_group_name = "SNDAIPINFRGP1401" }
  credential_type    = "subscription-key"
  authorise_fragment = "aip-authorise"
  named_values       = { clients = "aip-alpha-clients", access_window = "aip-alpha-access" }
  limits             = { tokens_per_minute = 1000, requests_per_minute = 60 }
  models = [{
    slug            = "gpt-5-nano"
    deployment_name = "alpha-gpt-5-nano"
    endpoint        = "https://aif-aip-infradev-swc.openai.azure.com"
    api_profile     = "chat-completions"
  }]
}

run "key_team_policy" {
  command = plan

  assert {
    condition     = azurerm_api_management_api.this.subscription_required
    error_message = "a key team's API requires a subscription"
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
    condition     = !strcontains(azurerm_api_management_api_policy.this.xml_content, "include-fragment")
    error_message = "key teams do not run the OAuth fragment"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "tokens-per-minute=\"1000\"")
    error_message = "the team's token limit is enforced"
  }

  assert {
    condition     = length(azurerm_api_management_named_value.clients) == 0
    error_message = "key teams have no client list"
  }

  assert {
    condition     = toset(keys(azurerm_api_management_api_operation.this)) == toset(["whoami", "chat-deployment", "chat-v1"])
    error_message = "a chat-completions model exposes its two operations and whoami"
  }
}

run "oauth_team_policy" {
  command = plan

  variables {
    credential_type = "oauth"
    client_ids      = ["00000000-0000-0000-0000-000000000011"]
  }

  assert {
    condition     = !azurerm_api_management_api.this.subscription_required
    error_message = "an OAuth team's API takes a token, not a key"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "<include-fragment fragment-id=\"aip-authorise\" />")
    error_message = "OAuth teams run the shared aip-authorise fragment"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "value=\"{{aip-alpha-clients}}\"")
    error_message = "the fragment reads the team's own client list"
  }

  assert {
    condition     = azurerm_api_management_named_value.clients[0].value == "00000000-0000-0000-0000-000000000011"
    error_message = "the client list holds the team registration"
  }

  assert {
    condition     = azurerm_api_management_named_value.access_window[0].value == "none"
    error_message = "access windows start empty; the Portal API activates them"
  }
}

run "refuses_more_than_forty_clients" {
  command = plan

  variables {
    credential_type = "oauth"
    client_ids      = [for i in range(41) : format("00000000-0000-0000-0000-%012d", i)]
  }

  expect_failures = [var.client_ids]
}

run "a_team_with_no_grants_refuses_every_model" {
  command = plan

  variables {
    models = []
  }

  assert {
    condition     = !strcontains(azurerm_api_management_api_policy.this.xml_content, "<choose>\n      <when condition=\"@((string)context.Variables[\"aipRequested\"]")
    error_message = "with no grants there is nothing to choose between"
  }

  assert {
    condition     = strcontains(azurerm_api_management_api_policy.this.xml_content, "model-not-granted")
    error_message = "with no grants every request is refused"
  }
}