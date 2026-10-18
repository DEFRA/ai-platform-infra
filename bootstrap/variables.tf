variable "params_file" {
  description = "As the names root: the environment's parameters from aip-checks params."
  type        = string
}

variable "deploy_client_id" {
  description = "Client ID of the existing app registration that is id-aip-deploy-{env} in Phase 1 (D5)."
  type        = string
}

variable "oidc_subject_prefixes" {
  description = "Each state repository's OIDC subject prefix (immutable subjects), from `gh api repos/DEFRA/{repo}/actions/oidc/customization/sub`."
  type        = map(string)

  validation {
    condition = (
      toset(keys(var.oidc_subject_prefixes)) == toset(["ai-platform-tenants", "ai-platform-deployments"]) &&
      alltrue([for repo, prefix in var.oidc_subject_prefixes : can(regex("^repo:DEFRA@[0-9]+/${repo}@[0-9]+$", prefix))])
    )
    error_message = "Expected exactly ai-platform-tenants and ai-platform-deployments, each with its own repo:DEFRA@{org-id}/{repo}@{repo-id} prefix."
  }
}

variable "grant_role_assignment_admin" {
  description = "Give the deploy identity Role Based Access Control Administrator, constrained to the platform's data-plane roles (D10: only if missing)."
  type        = bool
  default     = true
}

variable "grant_contributor" {
  description = "Give the deploy identity Contributor, at the existing resource group when `existing_resource_group` is set and at the subscription otherwise. Set false where it already holds Contributor there (D10: only if missing)."
  type        = bool
  default     = true
}

variable "grant_graph_application_owned_by" {
  description = "Grant Microsoft Graph Application.ReadWrite.OwnedBy to the deploy identity (needs an Entra role that can consent; D4, D12A)."
  type        = bool
  default     = false
}

variable "operator_state_access" {
  description = "Storage Blob Data Contributor for the operator running the bootstrap, to migrate its state; set false afterwards (no standing human access)."
  type        = bool
  default     = true
}

variable "lock_platform_resources" {
  description = "Second pass, after the first platform apply: CanNotDelete locks on both Key Vaults and the Log Analytics workspace. False until they exist."
  type        = bool
  default     = false
}