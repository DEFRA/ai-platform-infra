output "workspace_id" {
  value = azurerm_log_analytics_workspace.this.id
}

output "workspace_name" {
  value = azurerm_log_analytics_workspace.this.name
}

output "application_insights_id" {
  value = azurerm_application_insights.this.id
}

output "application_insights_connection_string" {
  description = "Holds an instrumentation key; with local authentication off it cannot ingest without an Entra token, but it stays out of plain outputs."
  value       = azurerm_application_insights.this.connection_string
  sensitive   = true
}