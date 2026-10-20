variable "name" {
  description = "Role name from the naming module. A custom role name is unique per tenant, so it carries the environment; the role's ID is derived from it."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{9,120}$", var.name))
    error_message = "name is lower-case words and hyphens from the naming module, at least 10 characters."
  }
}

variable "resource_group_id" {
  description = "The platform resource group. A role definition's assignable scopes cannot name a single resource, so the definition is scoped here and only the assignment is narrowed to API Management."
  type        = string

  validation {
    condition     = can(regex("^/subscriptions/[^/]+/resourceGroups/[^/]+$", var.resource_group_id))
    error_message = "resource_group_id is a resource group ID."
  }
}

variable "api_management_id" {
  description = "The API Management instance the role is assigned on."
  type        = string
}

variable "principal_object_id" {
  description = "The Portal API's service principal: the only principal that mints subscriptions."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", var.principal_object_id))
    error_message = "principal_object_id must be a GUID."
  }
}

variable "propagation_wait" {
  description = "How long to wait for a new role definition to propagate before it is assigned."
  type        = string
  default     = "60s"

  validation {
    condition     = can(regex("^[0-9]+(s|m)$", var.propagation_wait))
    error_message = "propagation_wait is a number of seconds or minutes, such as 60s."
  }
}
