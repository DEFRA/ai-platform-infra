mock_provider "azurerm" {
  mock_data "azurerm_client_config" {
    defaults = {
      tenant_id       = "00000000-0000-0000-0000-000000000000"
      object_id       = "00000000-0000-0000-0000-000000000003"
      client_id       = "00000000-0000-0000-0000-000000000004"
      subscription_id = "00000000-0000-0000-0000-000000000005"
    }
  }

  mock_data "azurerm_subscription" {
    defaults = {
      id              = "/subscriptions/00000000-0000-0000-0000-000000000005"
      subscription_id = "00000000-0000-0000-0000-000000000005"
    }
  }
}

mock_provider "azapi" {}

mock_provider "azuread" {}

variables {
  environment  = "infradev"
  service_code = "AIP"
  naming = {
    sub_type             = "SND"
    environment_instance = "1"
  }
  azure = {
    location         = "uksouth"
    network          = { mode = "public-minimal" }
    named_exceptions = []
    apim = {
      sku      = "Developer"
      capacity = 1
      publisher = {
        name  = "Defra AI Platform"
        email = "ai-platform@example.gov.uk"
      }
    }
    foundry   = { regions = ["uksouth", "swedencentral"] }
    key_vault = { soft_delete_retention_days = 7 }
    log_analytics = {
      retention_in_days         = 30
      daily_quota_gb            = 1
      subscription_activity_log = true
    }
    application_insights = { sampling_percentage = 100 }
    identities = {
      portal_api_principal_object_id = "00000000-0000-0000-0000-000000000002"
    }
  }
  entra_enabled = true
  release       = "v0.4.0"
}

run "plans_the_public_minimal_platform" {
  command = plan

  assert {
    condition     = azurerm_resource_group.platform[0].name == "SNDAIPINFRGP1401"
    error_message = "the platform resource group must take its CCoE name"
  }

  assert {
    condition     = module.apim.name == "apim-aip-infradev"
    error_message = "API Management must take its logical label"
  }

  assert {
    condition     = length(module.foundry) == 2
    error_message = "one Foundry account per configured region"
  }

  assert {
    condition     = azurerm_resource_group.platform[0].tags["aip-release"] == "v0.4.0"
    error_message = "every platform resource records the pinned release"
  }

  assert {
    condition     = length(module.api_audience) == 1
    error_message = "the API audience exists where Entra is enabled"
  }

  assert {
    condition = toset(keys(azurerm_monitor_diagnostic_setting.resource)) == toset([
      "api_management", "key_vault_platform", "key_vault_tenants",
      "foundry_uksouth", "foundry_swedencentral",
    ])
    error_message = "every platform resource sends diagnostics to the workspace"
  }

  assert {
    condition     = azurerm_monitor_diagnostic_setting.resource["api_management"].log_analytics_destination_type == "Dedicated"
    error_message = "API Management logs go to resource-specific tables"
  }

  assert {
    condition     = output.foundry_regions == tolist(["uksouth", "swedencentral"])
    error_message = "the tenants root reads the regions in configured order"
  }

  assert {
    condition     = output.naming.service_code == "AIP"
    error_message = "the tenants root's naming codes include the service code"
  }
}

run "deploys_into_an_existing_resource_group" {
  command = plan

  variables {
    azure = merge(var.azure, { existing_resource_group = "SNDAIEAIPRGP1401" })
  }

  assert {
    condition     = length(azurerm_resource_group.platform) == 0
    error_message = "the platform does not create a resource group made in advance"
  }

  assert {
    condition     = output.resource_group_name == "SNDAIEAIPRGP1401"
    error_message = "every platform resource goes into the existing resource group"
  }

  assert {
    condition     = module.apim.name == "apim-aip-infradev"
    error_message = "resources inside it keep their derived names"
  }
}

run "omits_the_api_audience_where_entra_is_disabled" {
  command = plan

  variables {
    entra_enabled = false
  }

  assert {
    condition     = length(module.api_audience) == 0
    error_message = "no Entra objects where the registry disables Entra"
  }
}

run "refuses_the_private_topology_until_it_is_built" {
  command = plan

  variables {
    azure = merge(var.azure, { network = { mode = "private" } })
  }

  expect_failures = [var.azure]
}

run "refuses_a_first_foundry_region_other_than_the_location" {
  command = plan

  variables {
    azure = merge(var.azure, { foundry = { regions = ["swedencentral", "uksouth"] } })
  }

  expect_failures = [var.azure]
}

run "refuses_another_service_code" {
  command = plan

  variables {
    service_code = "AIE"
  }

  expect_failures = [var.service_code]
}