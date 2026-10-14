# No resources and no providers. Applied with local state, it prints every
# name for an environment, including the state backend the apply workflow
# passes to `terraform init`; the bootstrap root uses it as a module.

locals {
  config = merge([for path in var.config_files : jsondecode(file(path))]...)
  codes  = merge(local.config.naming, { service_code = local.config.service_code })
}

module "naming" {
  source = "../modules/naming"

  environment     = local.config.environment
  codes           = local.codes
  location        = local.config.location
  foundry_regions = local.config.foundry_regions
}