variable "config_files" {
  description = "ai-platform-environments parameter files in -var-file order: global.tfvars.json, then environments/{env}/platform.tfvars.json. A later file's top-level key wins, as with -var-file."
  type        = list(string)

  validation {
    condition     = length(var.config_files) > 0 && alltrue([for path in var.config_files : endswith(path, ".tfvars.json")])
    error_message = "config_files lists at least one .tfvars.json file."
  }
}