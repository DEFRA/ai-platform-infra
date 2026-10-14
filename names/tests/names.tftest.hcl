variables {
  config_files = [
    "../examples/ai-platform-environments/global.tfvars.json",
    "../examples/ai-platform-environments/environments/infradev/platform.tfvars.json",
  ]
}

run "names_infradev_from_the_layered_parameters" {
  command = plan

  assert {
    condition     = output.backend.storage_account_name == "sndaipinfsto1401"
    error_message = "the state account takes its CCoE name"
  }

  assert {
    condition     = output.names.foundry_accounts["swedencentral"] == "aif-aip-infradev-swc"
    error_message = "the global Foundry regions apply to the environment"
  }
}

run "lets_the_environment_file_win" {
  command = plan

  variables {
    config_files = [
      "../examples/ai-platform-environments/global.tfvars.json",
      "../examples/ai-platform-environments/environments/infradev/platform.tfvars.json",
      "tests/override.tfvars.json",
    ]
  }

  assert {
    condition     = keys(output.names.foundry_accounts) == ["uksouth"]
    error_message = "a later file's top-level key replaces the earlier one"
  }
}

run "refuses_a_file_that_is_not_tfvars_json" {
  command = plan

  variables {
    config_files = ["../examples/ai-platform-environments/registry.json"]
  }

  expect_failures = [var.config_files]
}
