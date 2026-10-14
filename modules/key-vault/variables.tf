variable "name" {
  description = "Vault name from the naming module."
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "tenant_id" {
  type = string
}

variable "soft_delete_retention_days" {
  type = number

  validation {
    condition     = var.soft_delete_retention_days >= 7 && var.soft_delete_retention_days <= 90
    error_message = "soft_delete_retention_days must be between 7 and 90."
  }
}

variable "public_network_access" {
  description = "True only on the Phase 1 public minimal platform, or for the tenants vault under named exception X1."
  type        = bool
}

variable "allowed_ip_ranges" {
  description = "CIDR ranges allowed through the firewall when public access is on and the default action is Deny (X1)."
  type        = list(string)
  default     = []
}

variable "role_assignments" {
  description = "Data-plane roles at vault scope, keyed by a stable name; role_definition_id is a full ID from the roles module."
  type = map(object({
    principal_id       = string
    role_definition_id = string
  }))
  default = {}
}

variable "tags" {
  type = map(string)
}