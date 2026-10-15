# No resources and no providers. Applied with local state, it prints every
# name for an environment, including the state backend the apply workflow
# passes to `terraform init`; the bootstrap root uses it as a module.

locals {
  config = jsondecode(file(var.params_file))
  azure  = local.config.azure
  codes  = merge(local.config.naming, { service_code = local.config.service_code })
}

module "naming" {
  source = "../modules/naming"

  environment     = local.config.environment
  codes           = local.codes
  location        = local.azure.location
  foundry_regions = local.azure.foundry.regions

  existing_resource_group = try(local.azure.existing_resource_group, null)
}