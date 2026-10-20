variable "team_slug" {
  type = string
}

variable "api_name" {
  description = "API name and path from the naming module, {slug}."
  type        = string
}

variable "credential_type" {
  description = "What the API takes from a caller: a validated OAuth token (a team) or an API-scoped subscription key (the platform-owned research API only)."
  type        = string
  default     = "oauth"

  validation {
    condition     = contains(["oauth", "subscription-key"], var.credential_type)
    error_message = "credential_type is oauth or subscription-key."
  }
}

variable "api_management" {
  type = object({
    name                = string
    resource_group_name = string
  })
}

variable "models" {
  description = "Granted models: catalogue slug, deployment name (derived for a team, the name callers send for research), the hosting platform, the named backend for it and apiProfile."
  type = list(object({
    slug            = string
    deployment_name = string
    hosting         = string
    backend_id      = string
    api_profile     = string
  }))

  validation {
    condition     = alltrue([for model in var.models : contains(keys(var.fragments.backend), model.hosting)])
    error_message = "Every granted model's hosting platform has a backend fragment."
  }
}

variable "limits" {
  type = object({
    tokens_per_minute   = number
    requests_per_minute = number
  })
}

variable "client_ids" {
  description = "OAuth client list: the team's registration and external registrations."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for id in var.client_ids : can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", id))
    ]) && length(var.client_ids) <= 40
    error_message = "client_ids holds at most 40 GUIDs."
  }
}

variable "named_values" {
  description = "Names for the team's client list and access window named values."
  type = object({
    clients       = string
    access_window = string
  })
}

variable "fragments" {
  description = "The platform's shared fragments: whoami, request_model and the backend fragment per hosting platform (design C #model-access)."
  type = object({
    whoami        = string
    request_model = string
    backend       = map(string)
  })
}