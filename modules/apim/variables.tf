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