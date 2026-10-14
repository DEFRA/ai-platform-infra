# Reproduces Defra's CCoE naming pattern (DEFRA/plt-infrastructure-core,
# resources/naming-convention):
#   {SubType}{Svc}{Role}{ResType}{EnvInstance}{Region}{Instance}
# This module is the only place a resource name is composed.

locals {
  ccoe = {
    sub_types = [
      "AIP", "APS", "CAT", "DEV", "LOG", "MST", "OPS", "POC", "PRD", "PRE",
      "SEC", "SND", "SSV1", "SSV2", "SSV3", "SSV4", "SSV5", "TST",
    ]

    # CCoE's published list, plus AIP: the AI Platform's own service code
    # (requester direction, 13 October 2026), pending registration with CCoE.
    service_codes = [
      "AAD", "AIE", "AIM", "AIP", "BOO", "CHM", "CSC", "CUS", "EMZ", "EOB",
      "EXP", "FFC", "FFF", "IDM", "IMD", "IMF", "IMP",
    ]

    region_codes = {
      northeurope = "0"
      uksouth     = "4"
    }
  }

  # Used only in the logical labels for types CCoE has no code for.
  region_short_names = {
    uksouth       = "uks"
    swedencentral = "swc"
  }

  prefix = "${var.codes.sub_type}${var.codes.service_code}"
  suffix = "${var.codes.environment_instance}${local.ccoe.region_codes[var.location]}"

  # role, resource type and instance per CCoE-coded resource. Roles follow
  # Defra's get-names: INF for heterogeneous groups and platform plumbing,
  # APP for workload resources.
  coded = {
    resource_group_platform = { role = "INF", type = "RGP", instance = "01" }
    resource_group_state    = { role = "INF", type = "RGP", instance = "02" }
    storage_account_state   = { role = "INF", type = "STO", instance = "01" }
    log_analytics_workspace = { role = "APP", type = "LW", instance = "01" }
    application_insights    = { role = "APP", type = "AIS", instance = "01" }
    key_vault_platform      = { role = "APP", type = "KVT", instance = "01" }
    key_vault_tenants       = { role = "APP", type = "KVT", instance = "02" }
  }

  # Azure requires lower case for these.
  lower_case = ["storage_account_state", "key_vault_platform", "key_vault_tenants"]

  coded_names = {
    for key, parts in local.coded : key => (
      contains(local.lower_case, key)
      ? lower("${local.prefix}${parts.role}${parts.type}${local.suffix}${parts.instance}")
      : "${local.prefix}${parts.role}${parts.type}${local.suffix}${parts.instance}"
    )
  }

  # A resource group made for the team in advance replaces both derived
  # groups until the gate before DEV.
  existing_groups = var.existing_resource_group == null ? {} : {
    resource_group_platform = var.existing_resource_group
    resource_group_state    = var.existing_resource_group
  }

  # CCoE has no type code for these; design D allows the logical label,
  # and the gap is raised with CCoE (docs/modules.md).
  service = lower(var.codes.service_code)
  primary = var.foundry_regions[0]

  logical_names = {
    api_management   = "apim-${local.service}-${var.environment}"
    api_audience_app = "api-${local.service}-${var.environment}"
    foundry_accounts = {
      for region in var.foundry_regions : region => (
        region == local.primary
        ? "aif-${local.service}-${var.environment}"
        : "aif-${local.service}-${var.environment}-${local.region_short_names[region]}"
      )
    }
  }
}