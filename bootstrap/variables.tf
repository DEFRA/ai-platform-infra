variable "config_files" {
  description = "As the names root: global.tfvars.json, then environments/{env}/platform.tfvars.json."
  type        = list(string)
}

variable "deploy_client_id" {
  description = "Client ID of the existing app registration that is id-aip-deploy-{env} in Phase 1 (D5)."
  type        = string
}

variable "oidc_subject_prefixes" {
  description = "Each state repository's OIDC subject prefix (immutable subjects), from `gh api repos/DEFRA/{repo}/actions/oidc/customization/sub`."
  type        = map(string)

  validation {
    condition     = alltrue([for prefix in values(var.oidc_subject_prefixes) : can(regex("^repo:DEFRA@[0-9]+/ai-platform-(tenants|deployments)@[0-9]+$", prefix))])
    error_message = "Expected repo:DEFRA@{org-id}/ai-platform-tenants@{repo-id} and the deployments equivalent."
  }
}

variable "grant_role_assignment_admin" {
  description = "Give the deploy identity Role Based Access Control Administrator, constrained to the platform's data-plane roles (D10: only if missing)."
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