variable "display_name" {
  description = "Logical label from the naming module, app-aip-{env}-{slug}."
  type        = string
}

variable "owner_object_ids" {
  description = "The deploy identity and the Portal API identity (design E #changes)."
  type        = list(string)
}

variable "federations" {
  description = "The team file's oauth.federations; at most 20."
  type = list(object({
    name    = string
    issuer  = string
    subject = string
  }))

  validation {
    condition     = length(var.federations) <= 20
    error_message = "Entra allows at most 20 federated credentials per registration."
  }
}

variable "team_slug" {
  type = string
}

variable "environment" {
  type = string
}
