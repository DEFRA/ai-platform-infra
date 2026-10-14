# Mirrors schemas/environment.schema.json (R9). Values come from
# ai-platform-environments: -var-file global.tfvars.json, then
# -var-file environments/{env}/platform.tfvars.json, whose top-level keys
# win. Nothing here is specific to one environment.

variable "environment" {
  type = string
}

variable "location" {
  type = string

  validation {
    condition     = var.location == "uksouth"
    error_message = "The platform's control plane is in UK South."
  }
}

variable "service_code" {
  description = "The AI Platform's CCoE service code."
  type        = string

  validation {
    condition     = var.service_code == "AIP"
    error_message = "The AI Platform's service code is AIP."
  }
}

variable "naming" {
  description = "This environment's CCoE codes."
  type = object({
    sub_type             = string
    environment_instance = string
  })
}

variable "network" {
  type = object({
    mode = string
  })

  validation {
    condition     = var.network.mode == "public-minimal"
    error_message = "Only the Phase 1 public minimal platform is implemented; the private topology is built at the gate before DEV."
  }
}

# Validated by aip-checks; used once the private topology exists.
# tflint-ignore: terraform_unused_declarations
variable "named_exceptions" {
  type = list(object({
    id    = string
    owner = string
    ends  = string
  }))
  default = []
}

variable "apim" {
  type = object({
    sku      = string
    capacity = number
  })
}

variable "apim_publisher" {
  type = object({
    name  = string
    email = string
  })
}

variable "foundry_regions" {
  description = "Regions with a Foundry account; the first holds the projects."
  type        = list(string)

  validation {
    condition     = length(var.foundry_regions) > 0 && var.foundry_regions[0] == var.location
    error_message = "The first Foundry region holds the projects and must be the platform's location."
  }
}

variable "key_vault" {
  type = object({
    soft_delete_retention_days = number
  })
}

variable "log_analytics" {
  type = object({
    retention_in_days         = number
    daily_quota_gb            = optional(number)
    subscription_activity_log = bool
  })
}

variable "application_insights" {
  type = object({
    sampling_percentage = number
  })
}

variable "identities" {
  type = object({
    portal_api_principal_object_id = string
  })

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.identities.portal_api_principal_object_id))
    error_message = "portal_api_principal_object_id must be a GUID."
  }
}

variable "entra_enabled" {
  description = "The registry entry's entra.enabled: whether the API audience and team registrations exist here."
  type        = bool
}

variable "release" {
  description = "The pinned ai-platform-infra release, recorded in the aip-release tag."
  type        = string
}