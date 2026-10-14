mock_provider "azurerm" {
  mock_data "azurerm_client_config" {
    defaults = {
      tenant_id = "00000000-0000-0000-0000-000000000000"
      object_id = "00000000-0000-0000-0000-000000000003"
    }
  }
}

mock_provider "azuread" {
  mock_resource "azuread_application" {
    defaults = {
      id        = "/applications/00000000-0000-0000-0000-000000000010"
      client_id = "00000000-0000-0000-0000-000000000011"
    }
  }
}

override_data {
  target = data.terraform_remote_state.platform
  values = {
    outputs = {
      release                        = "v0.5.0"
      location                       = "uksouth"
      resource_group_name            = "SNDAIPINFRGP1401"
      portal_api_principal_object_id = "00000000-0000-0000-0000-000000000002"
      authorise_fragment             = "aip-authorise"
      foundry_regions                = ["uksouth", "swedencentral"]
      naming = {
        sub_type             = "SND"
        service_code         = "AIP"
        environment_instance = "1"
      }
      api_management = {
        id          = "/subscriptions/0/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.ApiManagement/service/apim-aip-infradev"
        name        = "apim-aip-infradev"
        gateway_url = "https://apim-aip-infradev.azure-api.net"
      }
      foundry_accounts = {
        uksouth = {
          id              = "/subscriptions/0/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.CognitiveServices/accounts/aif-aip-infradev"
          name            = "aif-aip-infradev"
          openai_endpoint = "https://aif-aip-infradev.openai.azure.com"
          primary         = true
        }
        swedencentral = {
          id              = "/subscriptions/0/resourceGroups/SNDAIPINFRGP1401/providers/Microsoft.CognitiveServices/accounts/aif-aip-infradev-swc"
          name            = "aif-aip-infradev-swc"
          openai_endpoint = "https://aif-aip-infradev-swc.openai.azure.com"
          primary         = false
        }
      }
    }
  }
}

variables {
  environment   = "infradev"
  release       = "v0.5.0"
  entra_enabled = true
  cdp = {
    issuer     = "https://00000000-0000-0000-0000-000000000000.tokens.sts.global.api.aws"
    awsAccount = "000000000000"
    audience   = "api://AzureADTokenExchange"
  }
  platform_state = {
    resource_group_name  = "SNDAIPINFRGP1402"
    storage_account_name = "sndaipinfsto1401"
    container_name       = "tfstate"
    key                  = "platform.tfstate"
  }
  team_sources = {
    alpha = { sha = "1111111111111111111111111111111111111111", operation_id = "000000000000000000000001" }
    beta  = { sha = "2222222222222222222222222222222222222222", operation_id = "000000000000000000000002" }
  }
  teams = {
    alpha = {
      schemaVersion = 1
      revision      = 1
      environment   = "infradev"
      status        = "active"
      team          = { slug = "alpha", serviceCode = "ZZZ" }
      deployments   = [{ slug = "gpt-5-nano", sku = "DataZoneStandard", capacity = 1, status = "active" }]
      gateway = {
        credentialType     = "subscription-key"
        allowedDeployments = ["gpt-5-nano"]
        limits             = { tokensPerMinute = 1000, requestsPerMinute = 60 }
      }
      operationId = "000000000000000000000001"
      updatedBy   = "entra:00000000-0000-0000-0000-000000000001"
      updatedAt   = "2026-10-13T00:00:00.000Z"
    }
    beta = {
      schemaVersion = 1
      revision      = 1
      environment   = "infradev"
      status        = "active"
      team          = { slug = "beta", serviceCode = "ZZZ" }
      deployments   = [{ slug = "gpt-4-1-nano", sku = "DataZoneStandard", capacity = 1, status = "active" }]
      gateway = {
        credentialType     = "oauth"
        allowedDeployments = ["gpt-4-1-nano"]
        limits             = { tokensPerMinute = 1000, requestsPerMinute = 60 }
      }
      oauth = {
        federations = [{
          name    = "beta-api"
          host    = "cdp"
          service = "beta-api"
        }]
        externalClients = []
        secretsAllowed  = true
      }
      operationId = "000000000000000000000002"
      updatedBy   = "entra:00000000-0000-0000-0000-000000000001"
      updatedAt   = "2026-10-13T00:00:00.000Z"
    }
  }
}

run "applies_a_key_team_and_an_oauth_team" {
  command = apply

  assert {
    condition     = output.teams.alpha.deployments["gpt-5-nano"].name == "alpha-gpt-5-nano"
    error_message = "a team deployment is named {slug}-{model}"
  }

  assert {
    condition     = output.teams.alpha.deployments["gpt-5-nano"].region == "swedencentral"
    error_message = "a DataZoneStandard deployment goes to the EU account"
  }

  assert {
    condition     = output.teams.alpha.project.name == "aip-alpha"
    error_message = "the project takes the derived name"
  }

  assert {
    condition     = output.teams.alpha.api.subscription_required && !output.teams.beta.api.subscription_required
    error_message = "key teams require a subscription; OAuth teams require a token"
  }

  assert {
    condition     = output.teams.alpha.registration == null && output.teams.beta.registration != null
    error_message = "only OAuth teams get a registration"
  }

  assert {
    condition = output.teams.beta.registration.federations["beta-api"] == {
      issuer   = "https://00000000-0000-0000-0000-000000000000.tokens.sts.global.api.aws"
      subject  = "arn:aws:iam::000000000000:role/beta-api"
      audience = "api://AzureADTokenExchange"
    }
    error_message = "a CDP federation takes its issuer, AWS account and audience from the registry entry"
  }

  assert {
    condition     = output.teams.alpha.api.url == "https://apim-aip-infradev.azure-api.net/alpha"
    error_message = "each team API sits at /{slug}"
  }

  assert {
    condition     = output.teams.alpha.tags["aip-source-sha"] == "1111111111111111111111111111111111111111" && output.teams.alpha.tags["aip-operation-id"] == "000000000000000000000001"
    error_message = "team resources carry the commit and operation that last changed the team file"
  }
}
run "refuses_a_global_sku" {
  command = plan

  variables {
    teams = {
      alpha = merge(var.teams.alpha, {
        deployments = [{ slug = "gpt-5-nano", sku = "GlobalStandard", capacity = 1, status = "active" }]
      })
    }
  }

  expect_failures = [var.teams]
}

run "refuses_a_grant_that_is_not_a_team_deployment" {
  command = plan

  variables {
    teams = {
      alpha = merge(var.teams.alpha, {
        gateway = merge(var.teams.alpha.gateway, { allowedDeployments = ["gpt-4o"] })
      })
    }
  }

  expect_failures = [var.teams]
}

run "refuses_a_cdp_federation_that_names_its_own_subject" {
  command = plan

  variables {
    teams = {
      beta = merge(var.teams.beta, {
        oauth = merge(var.teams.beta.oauth, {
          federations = [{
            name    = "beta-api"
            host    = "cdp"
            service = "beta-api"
            subject = "arn:aws:iam::111111111111:role/beta-api"
          }]
        })
      })
    }
  }

  expect_failures = [var.teams]
}

run "refuses_oauth_where_entra_is_disabled" {
  command = plan

  variables {
    entra_enabled = false
  }

  expect_failures = [var.teams]
}

run "refuses_a_release_the_platform_has_not_applied" {
  command = plan

  variables {
    release = "v0.6.0"
  }

  expect_failures = [terraform_data.platform_release]
}