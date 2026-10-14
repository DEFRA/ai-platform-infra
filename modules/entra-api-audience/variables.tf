variable "display_name" {
  description = "Logical label from the naming module, for example api-aip-infradev."
  type        = string
}

variable "owner_object_ids" {
  description = "Owners of the application and service principal: the deploy identity."
  type        = list(string)
}

variable "environment" {
  type = string
}