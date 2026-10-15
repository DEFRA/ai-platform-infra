variable "name" {
  description = "Project name from the naming module's team format."
  type        = string
}

variable "account_id" {
  description = "The primary Foundry account."
  type        = string
}

variable "location" {
  type = string
}

variable "team_slug" {
  type = string
}

variable "tags" {
  type = map(string)
}
