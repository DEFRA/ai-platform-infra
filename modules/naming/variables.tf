variable "environment" {
  description = "Logical environment name, the registry entry (for example infradev)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{1,15}$", var.environment))
    error_message = "environment must match ^[a-z][a-z0-9]{1,15}$."
  }
}

variable "codes" {
  description = "CCoE codes for the environment, from ai-platform-environments."
  type = object({
    sub_type             = string
    service_code         = string
    environment_instance = string
  })

  validation {
    condition     = contains(local.ccoe.sub_types, var.codes.sub_type)
    error_message = "codes.sub_type is not a CCoE sub type."
  }

  validation {
    condition     = contains(local.ccoe.service_codes, var.codes.service_code)
    error_message = "codes.service_code is not a recognised service code."
  }

  validation {
    condition     = can(regex("^[0-9]$", var.codes.environment_instance))
    error_message = "codes.environment_instance must be one digit."
  }
}

variable "location" {
  description = "Primary region; every CCoE-coded resource sits here."
  type        = string
  default     = "uksouth"

  validation {
    condition     = contains(keys(local.ccoe.region_codes), var.location)
    error_message = "location has no CCoE region code."
  }
}

variable "foundry_regions" {
  description = "Regions with a Foundry account; the first is the primary region."
  type        = list(string)
  default     = ["uksouth"]

  validation {
    condition = alltrue([
      for region in var.foundry_regions : contains(keys(local.region_short_names), region)
    ])
    error_message = "foundry_regions holds a region with no short name."
  }

  validation {
    condition     = length(var.foundry_regions) > 0 && length(distinct(var.foundry_regions)) == length(var.foundry_regions)
    error_message = "foundry_regions needs at least one region, each listed once."
  }
}