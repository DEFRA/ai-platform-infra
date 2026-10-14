variable "workspace_name" {
  description = "Log Analytics workspace name from the naming module."
  type        = string
}

variable "application_insights_name" {
  description = "Application Insights name from the naming module."
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "retention_in_days" {
  type = number

  validation {
    condition     = var.retention_in_days >= 30 && var.retention_in_days <= 730
    error_message = "retention_in_days must be between 30 and 730."
  }
}

variable "daily_quota_gb" {
  description = "Daily ingestion cap in GB; null for none."
  type        = number
  default     = null
}

variable "sampling_percentage" {
  type    = number
  default = 100
}

variable "public_network_access" {
  description = "Public ingestion and query; true only on the Phase 1 public minimal platform (and X3 for Application Insights ingestion)."
  type        = bool
}

variable "tags" {
  type = map(string)
}