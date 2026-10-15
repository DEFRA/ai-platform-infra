# Mirrors schemas/environment.schema.json (R9). Values come from the one
# file aip-checks params writes: ai-platform-environments' global file
# deep-merged with the environment's. Codes every cloud shares are top-level
# variables; everything specific to Azure is in azure. Nothing here is
# specific to one environment.

variable "environment" {
  type = string
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

variable "azure" {
  description = "Everything specific to Azure for this environment."
  type = object({
    location                = string
    existing_resource_group = optional(string)
    network = object({
      mode = string
    })
    # Validated by aip-checks; used once the private topology exists.
    named_exceptions = list(object({
      id    = string
      owner = string
      ends  = string
    }))
    apim = object({
      sku      = string
      capacity = number
      publisher = object({
        name  = string
        email = string
      })
    })
    foundry = object({
      regions = list(string)
    })
    key_vault = object({
      soft_delete_retention_days = number
    })
    log_analytics = object({
      retention_in_days         = number
      daily_quota_gb            = optional(number)
      subscription_activity_log = bool
    })
    application_insights = object({
      sampling_percentage = number
    })
    identities = object({
      portal_api_principal_object_id = string
    })
  })

  validation {
    condition     = var.azure.location == "uksouth"
    error_message = "The platform's control plane is in UK South."
  }

  validation {
    condition     = var.azure.existing_resource_group == null || can(regex("^[A-Z]{3}[A-Z0-9]{3}[A-Z]{3}RGP[0-9]{4}$", var.azure.existing_resource_group))
    error_message = "azure.existing_resource_group must be a CCoE resource group name, such as SNDAIEAIPRGP1401."
  }

  validation {
    condition     = var.azure.network.mode == "public-minimal"
    error_message = "Only the Phase 1 public minimal platform is implemented; the private topology is built at the gate before DEV."
  }

  validation {
    condition     = length(var.azure.foundry.regions) > 0 && var.azure.foundry.regions[0] == var.azure.location
    error_message = "The first Foundry region holds the projects and must be the platform's location."
  }

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.azure.identities.portal_api_principal_object_id))
    error_message = "azure.identities.portal_api_principal_object_id must be a GUID."
  }
}

variable "entra_enabled" {
  description = "The registry entry's entra.enabled: whether the API audience exists here."
  type        = bool
}

variable "release" {
  description = "The pinned ai-platform-infra release, recorded in the aip-release tag."
  type        = string
}
