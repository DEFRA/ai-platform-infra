variable "name" {
  description = "Deployment name from the naming module, {slug}-{model}."
  type        = string
}

variable "account_id" {
  description = "The Foundry account in the region the SKU is offered in."
  type        = string
}

variable "model" {
  description = "Catalogue model: format, name and pinned version."
  type = object({
    format  = string
    name    = string
    version = string
  })
}

variable "sku" {
  type = string

  validation {
    condition     = !startswith(var.sku, "Global")
    error_message = "Global deployment types are excluded for team deployments (D03)."
  }
}

variable "capacity" {
  description = "Thousands of tokens per minute."
  type        = number
}
