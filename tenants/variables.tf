variable "environment" {
  type = string
}

variable "release" {
  description = "The pinned ai-platform-infra release; must equal the platform state's."
  type        = string
}

variable "entra_enabled" {
  description = "The registry entry's entra.enabled."
  type        = bool
}

variable "cdp" {
  description = "The registry entry's cdp block: the issuer, AWS account and audience of this environment's CDP Web Identity trust."
  type = object({
    issuer     = string
    awsAccount = string
    audience   = string
  })
}

variable "platform_state" {
  description = "Where the platform state is, from the names root."
  type = object({
    resource_group_name  = string
    storage_account_name = string
    container_name       = string
    key                  = string
  })
}

variable "team_sources" {
  description = "Commit and operation that last changed each team's file, from aip-checks teams-variables."
  type = map(object({
    sha          = string
    operation_id = string
  }))
}

# Mirrors schemas/team.schema.json (R9). Bundled from
# environments/{env}/*.json by aip-checks teams-variables.
variable "teams" {
  type = map(object({
    schemaVersion = number
    revision      = number
    environment   = string
    status        = string
    removeAfter   = optional(string)
    promotedFrom = optional(object({
      environment = string
      sha         = string
    }))
    team = object({
      slug        = string
      serviceCode = string
    })
    deployments = list(object({
      slug     = string
      sku      = string
      capacity = number
      status   = string
    }))
    gateway = object({
      credentialType     = string
      allowedDeployments = list(string)
      limits = object({
        tokensPerMinute   = number
        requestsPerMinute = number
      })
    })
    oauth = optional(object({
      federations = list(object({
        name    = string
        host    = string
        service = optional(string)
        issuer  = optional(string)
        subject = optional(string)
      }))
      externalClients = list(object({
        name     = string
        tenantId = string
        clientId = string
      }))
      secretsAllowed = bool
      exception = optional(object({
        host       = string
        reason     = string
        reviewDate = string
      }))
    }))
    operationId = string
    updatedBy   = string
    updatedAt   = string
  }))

  validation {
    condition     = alltrue([for key, team in var.teams : key == team.team.slug && can(regex("^[a-z][a-z0-9-]{1,22}[a-z0-9]$", key))])
    error_message = "Each team is keyed by its slug, which matches ^[a-z][a-z0-9-]{1,22}[a-z0-9]$."
  }

  validation {
    condition     = alltrue([for team in var.teams : team.environment == var.environment && team.schemaVersion == 1])
    error_message = "Every team file belongs to this environment and uses schemaVersion 1."
  }

  validation {
    condition     = alltrue([for team in var.teams : contains(["active", "pending-removal"], team.status)])
    error_message = "Only active and pending-removal teams are applied."
  }

  validation {
    condition = alltrue([
      for team in var.teams : contains(["oauth", "subscription-key"], team.gateway.credentialType)
      && (team.gateway.credentialType == "oauth") == (team.oauth != null)
    ])
    error_message = "oauth is present exactly when the credential type is oauth."
  }

  validation {
    condition     = var.entra_enabled || alltrue([for team in var.teams : team.oauth == null])
    error_message = "OAuth teams need Entra enabled for the environment."
  }

  validation {
    condition = alltrue([
      for team in var.teams : alltrue([
        for slug in team.gateway.allowedDeployments : contains([for d in team.deployments : d.slug], slug)
      ])
    ])
    error_message = "allowedDeployments holds only the team's own deployments in Phase 1."
  }

  validation {
    condition = alltrue(flatten([
      for team in var.teams : [for d in team.deployments : !startswith(d.sku, "Global") && d.capacity >= 1]
    ]))
    error_message = "Team deployments use non-Global SKUs (D03) with capacity of at least 1."
  }

  validation {
    condition = alltrue([
      for team in var.teams : team.oauth == null ? true : (
        length(team.oauth.federations) <= 20 && length(team.oauth.externalClients) <= 39
      )
    ])
    error_message = "At most 20 federations and 40 clients per team."
  }

  validation {
    condition = alltrue(flatten([
      for team in var.teams : [
        for federation in try(team.oauth.federations, []) : federation.host == "cdp"
        ? federation.service != null && federation.issuer == null && federation.subject == null
        : federation.host == "azure" && federation.service == null && federation.issuer != null && federation.subject != null
      ]
    ]))
    error_message = "A CDP federation names only its service; an Azure federation names its issuer and subject."
  }

  validation {
    condition     = alltrue([for team in var.teams : can(regex("^[A-Z0-9]{3}$", team.team.serviceCode))])
    error_message = "serviceCode is three upper-case characters."
  }
}