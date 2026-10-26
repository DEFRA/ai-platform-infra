variables {
  params_file = "tests/params.tfvars.json"
}

run "names_infradev_from_its_parameters" {
  command = plan

  assert {
    condition     = output.backend.storage_account_name == "sndaipinfsto1401"
    error_message = "the state account takes its CCoE name"
  }

  assert {
    condition     = output.names.foundry_accounts["swedencentral"] == "aif-aip-infradev-swc"
    error_message = "every configured Foundry region gets an account"
  }

  assert {
    condition     = !output.existing_resource_group
    error_message = "the platform creates its own resource groups unless told otherwise"
  }

  assert {
    condition     = format(output.federated_credential, "ai-platform-deployments", "infradev") == "ai-platform-deployments-infradev"
    error_message = "the names root hands on the federated credential name format"
  }
}

run "refuses_a_file_that_is_not_tfvars_json" {
  command = plan

  variables {
    params_file = "../examples/ai-platform-environments/registry.json"
  }

  expect_failures = [var.params_file]
}
