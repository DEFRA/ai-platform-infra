variables {
  environment = "infradev"
  codes = {
    sub_type             = "SND"
    service_code         = "AIP"
    environment_instance = "1"
  }
  foundry_regions = ["uksouth", "swedencentral"]
}

run "composes_ccoe_names" {
  command = plan

  assert {
    condition     = output.names.resource_group_platform == "SNDAIPINFRGP1401"
    error_message = "platform resource group name does not follow the CCoE pattern"
  }

  assert {
    condition     = output.names.resource_group_state == "SNDAIPINFRGP1402"
    error_message = "state resource group name does not follow the CCoE pattern"
  }

  assert {
    condition     = output.names.storage_account_state == "sndaipinfsto1401"
    error_message = "state storage account must be the lower-cased CCoE name"
  }

  assert {
    condition     = output.names.key_vault_platform == "sndaipappkvt1401" && output.names.key_vault_tenants == "sndaipappkvt1402"
    error_message = "key vault names must be lower-cased CCoE names with instances 01 and 02"
  }

  assert {
    condition     = output.names.log_analytics_workspace == "SNDAIPAPPLW1401"
    error_message = "workspace name does not follow the CCoE pattern"
  }
}

run "uses_logical_labels_where_ccoe_has_no_code" {
  command = plan

  assert {
    condition     = output.names.api_management == "apim-aip-infradev"
    error_message = "API Management must use the logical label"
  }

  assert {
    condition = output.names.foundry_accounts == {
      uksouth       = "aif-aip-infradev"
      swedencentral = "aif-aip-infradev-swc"
    }
    error_message = "the primary Foundry account takes the plain label; others add the region"
  }

  assert {
    condition     = format(output.team.deployment, "alpha", "gpt-5-nano") == "alpha-gpt-5-nano"
    error_message = "team deployments are named {slug}-{model}"
  }

  assert {
    condition     = output.names.apim_subscription_role == "aip-infradev-apim-subscription-manager"
    error_message = "the custom role carries the environment, because role names are unique per tenant"
  }

  assert {
    condition     = output.names.events_identity == "id-aip-events-infradev"
    error_message = "the events identity is id-aip-events-{env}"
  }
}

run "names_the_events_identity_for_each_environment" {
  command = plan

  variables {
    environment = "abcdefghijklmnop"
  }

  assert {
    condition     = output.names.events_identity == "id-aip-events-abcdefghijklmnop"
    error_message = "the events identity name follows the environment, up to the 16-character maximum"
  }
}

run "names_a_github_environment_credential_from_the_repository_and_environment" {
  command = plan

  assert {
    condition     = format(output.federated_credential, "ai-platform-tenants", "infradev-events") == "ai-platform-tenants-infradev-events"
    error_message = "a federated credential for a GitHub Environment is named {repository}-{environment}, which keeps the names already applied"
  }
}

run "lists_the_managed_identity_among_the_ccoe_gaps" {
  command = plan

  assert {
    condition     = contains(output.ccoe_gaps, "User-assigned managed identity")
    error_message = "the events identity uses a logical label, so the gap is raised with CCoE"
  }
}

run "rejects_an_unknown_sub_type" {
  command = plan

  variables {
    codes = {
      sub_type             = "XXX"
      service_code         = "AIP"
      environment_instance = "1"
    }
  }

  expect_failures = [var.codes]
}

run "rejects_a_region_without_a_ccoe_code" {
  command = plan

  variables {
    location = "swedencentral"
  }

  expect_failures = [var.location]
}

run "uses_an_existing_resource_group_for_the_platform_and_its_state" {
  command = plan

  variables {
    existing_resource_group = "SNDAIEAIPRGP1401"
  }

  assert {
    condition     = output.names.resource_group_platform == "SNDAIEAIPRGP1401" && output.names.resource_group_state == "SNDAIEAIPRGP1401"
    error_message = "an existing resource group holds the platform and its state"
  }

  assert {
    condition     = output.names.storage_account_state == "sndaipinfsto1401"
    error_message = "resources inside it keep their derived names"
  }
}

run "refuses_a_resource_group_name_that_is_not_ccoe_coded" {
  command = plan

  variables {
    existing_resource_group = "rg-aip"
  }

  expect_failures = [var.existing_resource_group]
}

run "refuses_no_foundry_region" {
  command = plan

  variables {
    foundry_regions = []
  }

  expect_failures = [var.foundry_regions]
}

run "refuses_a_foundry_region_listed_twice" {
  command = plan

  variables {
    foundry_regions = ["uksouth", "uksouth"]
  }

  expect_failures = [var.foundry_regions]
}
