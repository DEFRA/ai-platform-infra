variable "team_slug" {
  type = string
}

variable "api_name" {
  description = "API name and path from the naming module, {slug}."
  type        = string
}

variable "api_management" {
  type = object({
    name                = string
    resource_group_name = string
  })
}

variable "models" {
  description = "Granted models: catalogue slug, derived deployment name, gateway backend URL and apiProfile."
  type = list(object({
    slug            = string
    deployment_name = string
    endpoint        = string
    api_profile     = string
  }))
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

variable "authorise_fragment" {
  type = string
}