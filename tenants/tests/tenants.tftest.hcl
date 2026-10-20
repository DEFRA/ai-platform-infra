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
      apim_fragments = {
        whoami        = "aip-whoami"
        request_model = "aip-request-model"
        backend       = { foundry = "aip-backend-foundry" }
      }
      apim_backends = {
        foundry = { uksouth = "aip-foundry-uksouth", swedencentral = "aip-foundry-swedencentral" }
      }
      foundry_regions = ["uksouth", "swedencentral"]
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
  environment        = "infradev"
  release            = "v0.5.0"
  team_registrations = true
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
    alpha    = { sha = "1111111111111111111111111111111111111111", operation_id = "000000000000000000000001" }
    beta     = { sha = "2222222222222222222222222222222222222222", operation_id = "000000000000000000000002" }
    research = { sha = "3333333333333333333333333333333333333333", operation_id = "000000000000000000000003" }
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
        credentialType     = "oauth"
        allowedDeployments = ["gpt-5-nano"]
        limits             = { tokensPerMinute = 1000, requestsPerMinute = 60 }
      }
      oauth = {
        federations     = []
        externalClients = []
        secretsAllowed  = true
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
    # The platform-owned research team: a subscription key, no oauth block, and
    # deployment names written in the file because they are its API's contract.
    research = {
      schemaVersion = 1
      revision      = 1
      environment   = "infradev"
      status        = "active"
      team          = { slug = "research", serviceCode = "AIP" }
      deployments = [
        { slug = "gpt-4-1-nano", deploymentName = "gpt-4.1-nano", sku = "DataZoneStandard", capacity = 1, status = "active" },
        { slug = "gpt-4o", deploymentName = "gpt-4o", sku = "Standard", capacity = 1, status = "active" },
        { slug = "gpt-5-nano", deploymentName = "gpt-5-nano", sku = "DataZoneStandard", capacity = 1, status = "active" },
      ]
      gateway = {
        credentialType     = "subscription-key"
        allowedDeployments = ["gpt-4.1-nano", "gpt-4o", "gpt-5-nano"]
        limits             = { tokensPerMinute = 1000, requestsPerMinute = 60 }
      }
      operationId = "000000000000000000000003"
      updatedBy   = "github:583231"
      updatedAt   = "2026-10-20T00:00:00.000Z"
    }
  }
}

run "applies_a_team_with_client_secrets_and_a_federated_team" {
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
    condition     = output.teams.alpha.deployments["gpt-5-nano"].hosting == "foundry" && output.teams.alpha.deployments["gpt-5-nano"].backend == "aip-foundry-swedencentral"
    error_message = "a model takes its offering's hosting from the catalogue and routes to the platform's backend for that region"
  }

  assert {
    condition     = output.teams.alpha.project.name == "aip-alpha"
    error_message = "the project takes the derived name"
  }

  assert {
    condition     = output.teams.alpha.registration != null && output.teams.beta.registration != null
    error_message = "every team gets its registration: the team tier is OAuth only"
  }

  assert {
    condition     = length(output.teams.alpha.registration.federations) == 0
    error_message = "a team that uses client secrets has no federated credential"
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

run "refuses_a_foundry_deployment_without_capacity" {
  command = plan

  variables {
    teams = {
      alpha = merge(var.teams.alpha, {
        deployments = [{ slug = "gpt-5-nano", sku = "DataZoneStandard", status = "active" }]
      })
    }
  }

  expect_failures = [var.teams]
}

run "removing_a_deployment_removes_only_that_deployment" {
  command = plan

  variables {
    teams = {
      alpha = var.teams.alpha
      beta = merge(var.teams.beta, {
        deployments = []
        gateway     = merge(var.teams.beta.gateway, { allowedDeployments = [] })
      })
    }
  }

  assert {
    condition     = length(output.teams.beta.deployments) == 0 && length(output.teams.alpha.deployments) == 1
    error_message = "a team file without the deployment plans no deployment for it and leaves other teams alone"
  }

  assert {
    condition     = output.teams.beta.project.name == "aip-beta" && output.teams.beta.api.name == "beta"
    error_message = "the team's project and API stay while it has no deployments"
  }
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

run "refuses_a_subscription_key_team" {
  command = plan

  variables {
    teams = {
      alpha = merge(var.teams.alpha, {
        gateway = merge(var.teams.alpha.gateway, { credentialType = "subscription-key" })
      })
    }
  }

  expect_failures = [var.teams]
}

run "applies_the_research_team_beside_the_others" {
  command = apply

  assert {
    condition = (
      output.teams.research.deployments["gpt-4-1-nano"].name == "gpt-4.1-nano" &&
      output.teams.research.deployments["gpt-4o"].name == "gpt-4o" &&
      output.teams.research.deployments["gpt-5-nano"].name == "gpt-5-nano"
    )
    error_message = "a research deployment keeps the name its callers send; nothing derives it"
  }

  assert {
    condition = (
      output.teams.research.deployments["gpt-4-1-nano"].region == "swedencentral" &&
      output.teams.research.deployments["gpt-4o"].region == "uksouth" &&
      output.teams.research.deployments["gpt-4o"].backend == "aip-foundry-uksouth"
    )
    error_message = "each deployment is an account child in the region of its research SKU, routed to that account's backend"
  }

  assert {
    condition     = output.teams.research.registration == null && output.teams.alpha.registration != null
    error_message = "the research team takes no token, so it has no registration even where team registrations are on"
  }

  assert {
    condition     = output.teams.research.api.url == "https://apim-aip-infradev.azure-api.net/research" && output.teams.research.api.named_values == null
    error_message = "the research API sits at /research and has no OAuth named values"
  }

  assert {
    condition     = output.teams.research.project.name == "aip-research"
    error_message = "the research project is a shared project built by the same module as a team's"
  }

  assert {
    condition     = output.teams.alpha.deployments["gpt-5-nano"].name == "alpha-gpt-5-nano" && output.teams.alpha.api.named_values.clients == "aip-alpha-clients"
    error_message = "a team beside it is unchanged: derived names and its OAuth named values"
  }
}

run "refuses_a_team_that_is_not_research_holding_a_key" {
  command = plan

  variables {
    teams = {
      gamma = merge(var.teams.research, { team = { slug = "gamma", serviceCode = "AIP" } })
    }
    team_sources = {
      gamma = var.team_sources.research
    }
  }

  expect_failures = [var.teams]
}

run "refuses_the_research_team_taking_a_token" {
  command = plan

  variables {
    teams = {
      research = merge(var.teams.alpha, { team = { slug = "research", serviceCode = "AIP" } })
    }
    team_sources = {
      research = var.team_sources.research
    }
  }

  expect_failures = [var.teams]
}

run "refuses_a_key_team_with_an_oauth_block" {
  command = plan

  variables {
    teams = {
      research = merge(var.teams.research, { oauth = var.teams.alpha.oauth })
    }
  }

  expect_failures = [var.teams]
}

run "refuses_a_deployment_name_in_a_team_file" {
  command = plan

  variables {
    teams = {
      alpha = merge(var.teams.alpha, {
        deployments = [{ slug = "gpt-5-nano", deploymentName = "mine", sku = "DataZoneStandard", capacity = 1, status = "active" }]
      })
    }
  }

  expect_failures = [var.teams]
}

run "refuses_an_unnamed_research_deployment" {
  command = plan

  variables {
    teams = {
      research = merge(var.teams.research, {
        deployments = [{ slug = "gpt-5-nano", sku = "DataZoneStandard", capacity = 1, status = "active" }]
        gateway     = merge(var.teams.research.gateway, { allowedDeployments = ["gpt-5-nano"] })
      })
    }
  }

  expect_failures = [var.teams]
}

run "refuses_research_allowing_a_slug_nobody_named" {
  command = plan

  variables {
    teams = {
      research = merge(var.teams.research, {
        gateway = merge(var.teams.research.gateway, { allowedDeployments = ["gpt-4-1-nano"] })
      })
    }
  }

  expect_failures = [var.teams]
}

run "refuses_a_global_research_sku" {
  command = plan

  variables {
    teams = {
      research = merge(var.teams.research, {
        deployments = [{ slug = "gpt-5-nano", deploymentName = "gpt-5-nano", sku = "GlobalStandard", capacity = 1, status = "active" }]
        gateway     = merge(var.teams.research.gateway, { allowedDeployments = ["gpt-5-nano"] })
      })
    }
  }

  expect_failures = [var.teams]
}

run "applies_teams_without_registrations" {
  command = apply

  variables {
    team_registrations = false
    teams = {
      alpha = var.teams.alpha
    }
  }

  assert {
    condition     = output.teams.alpha.registration == null
    error_message = "no registration is created where team registrations are off"
  }

  assert {
    condition     = output.teams.alpha.deployments["gpt-5-nano"].name == "alpha-gpt-5-nano" && output.teams.alpha.api.url == "https://apim-aip-infradev.azure-api.net/alpha"
    error_message = "the team's deployments and API are still applied"
  }
}

run "refuses_a_federation_where_team_registrations_are_off" {
  command = plan

  variables {
    team_registrations = false
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