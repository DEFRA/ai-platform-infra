output "teams" {
  description = "Each team's resources: published in the run report, verified by the Portal API."
  value       = { for slug, team in module.team : slug => team.resources }
}