variable "team" {
  description = "One validated team file (schemas/team.schema.json)."
  type        = any
}

variable "source_commit" {
  description = "The commit and operation that last changed the team's file."
  type = object({
    sha          = string
    operation_id = string
  })
}

variable "environment" {
  type = string
}

variable "names" {
  description = "Team format strings from the naming module."
  type = object({
    project                   = string
    deployment                = string
    api                       = string
    registration              = string
    clients_named_value       = string
    access_window_named_value = string
  })
}

variable "platform" {
  description = "Platform outputs read from the platform state."
  type = object({
    api_management = object({
      name                = string
      resource_group_name = string
      gateway_url         = string
    })
    foundry_accounts = map(object({
      id              = string
      name            = string
      openai_endpoint = string
      primary         = bool
    }))
    fragments = object({
      whoami        = string
      request_model = string
      backend       = map(string)
    })
    backends = map(map(string))
  })

  validation {
    condition     = contains(keys(var.platform.backends), "foundry") && contains(keys(var.platform.fragments.backend), "foundry")
    error_message = "The platform publishes a backend per Foundry region and the Foundry backend fragment."
  }
}

variable "catalogue" {
  description = "Catalogue models by slug at the pinned release, each with the hosting of its offering."
  type        = any
}

variable "cdp" {
  description = "The environment's CDP trust from its registry entry: the issuer, AWS account and audience every CDP federation uses."
  type = object({
    issuer     = string
    awsAccount = string
    audience   = string
  })
}

variable "owner_object_ids" {
  description = "Owners of the team registration: the deploy identity and the Portal API identity."
  type        = list(string)
}

variable "registration_enabled" {
  description = "Whether to create the team's Entra app registration. False leaves the team's API with only its external clients."
  type        = bool
}


variable "tags" {
  type = map(string)
}