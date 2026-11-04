variable "name" {
  description = "API Management name from the naming module."
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "sku" {
  description = "Tier from the environment parameters; Developer for the first proof, PremiumV2 in consumer environments (D15)."
  type        = string

  validation {
    condition     = contains(["Developer", "Basic", "Standard", "Premium", "BasicV2", "StandardV2", "PremiumV2"], var.sku)
    error_message = "sku is not an API Management tier."
  }
}

variable "capacity" {
  type = number
}

variable "publisher_name" {
  type = string
}

variable "publisher_email" {
  type = string
}

variable "public_network_access" {
  type = bool
}

variable "application_insights_id" {
  type = string
}

variable "application_insights_connection_string" {
  type      = string
  sensitive = true
}

variable "sampling_percentage" {
  type    = number
  default = 100
}

variable "tenant_id" {
  type = string
}

variable "api_audience_client_id" {
  description = "Client ID of api-aip-{env}; null when Entra is not enabled in the environment."
  type        = string
  default     = null
}

variable "key_tier_paths" {
  description = "API paths (context.Api.Path) that take a subscription key instead of a token: the Research tier. Every other API takes a validated Entra token, and nothing a team policy sets changes the tier (design E #enforcement, G1)."
  type        = list(string)
  default     = ["research"]

  validation {
    condition     = length(var.key_tier_paths) > 0 && alltrue([for path in var.key_tier_paths : can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", path))]) && length(distinct(var.key_tier_paths)) == length(var.key_tier_paths)
    error_message = "key_tier_paths lists one or more distinct API paths: lower-case letters, digits and hyphens, so the list is safe to substitute into the policy."
  }
}

variable "delegated_paths" {
  description = "API paths that may take a delegated (idtyp user) token instead of an app-only one: the DEV developer route, reviewed at the gate before DEV. Empty means every OAuth API takes app-only tokens."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for path in var.delegated_paths : can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", path))]) && length(distinct(var.delegated_paths)) == length(var.delegated_paths) && length(setintersection(var.delegated_paths, var.key_tier_paths)) == 0
    error_message = "delegated_paths lists distinct API paths (lower-case letters, digits and hyphens), none of them a key-tier path."
  }
}

variable "names" {
  description = "Child names from the naming module: logger, named values and fragments."
  type = object({
    logger       = string
    tenant_id    = string
    api_audience = string
    deny_list    = string
    fragments = object({
      authorise     = string
      key_guard     = string
      team_grant    = string
      whoami        = string
      request_model = string
      backend       = map(string)
    })
  })

  validation {
    condition     = contains(keys(var.names.fragments.backend), "foundry")
    error_message = "names.fragments.backend names the fragment for every hosting platform this release supports: foundry."
  }
}

variable "telemetry_role_definition_id" {
  description = "Monitoring Metrics Publisher role definition ID from the roles module: the gateway sends telemetry with Entra authentication."
  type        = string
}

variable "tags" {
  type = map(string)
}