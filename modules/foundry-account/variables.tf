variable "name" {
  description = "Account name from the naming module; also its custom subdomain."
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string

  validation {
    condition     = contains(["uksouth", "swedencentral"], var.location)
    error_message = "Foundry accounts may only be in UK South or Sweden Central (D03)."
  }
}

variable "projects_enabled" {
  description = "True for the primary account, which holds every team's Foundry project."
  type        = bool
}

variable "public_network_access" {
  type = bool
}

variable "gateway_principal_id" {
  description = "The API Management identity: the only data-plane principal on the account."
  type        = string
}

variable "gateway_role_definition_id" {
  description = "Foundry User role definition ID from the roles module."
  type        = string
}

variable "tags" {
  type = map(string)
}