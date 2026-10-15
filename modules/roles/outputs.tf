output "ids" {
  description = "Role definition IDs at subscription scope, the form Azure returns, so assignments never show a diff."
  value = {
    for role, guid in local.guids :
    role => "${data.azurerm_subscription.current.id}/providers/Microsoft.Authorization/roleDefinitions/${guid}"
  }
}

output "delegable_guids" {
  description = "GUIDs of the only roles the deploy identity may assign or remove."
  value       = [for role in local.delegable : local.guids[role]]
}