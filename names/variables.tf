variable "params_file" {
  description = "The environment's parameters as aip-checks params writes them: the global file deep-merged with the environment's."
  type        = string

  validation {
    condition     = endswith(var.params_file, ".tfvars.json")
    error_message = "params_file is the .tfvars.json file aip-checks params writes."
  }
}
