output "resources" {
  description = "What the team has in Azure and Entra; published in the run report and verified by the Portal API."
  value = {
    tags = local.tags
    project = {
      id   = module.project.id
      name = module.project.name
    }
    deployments = {
      for slug, deployment in module.deployment : slug => {
        id     = deployment.id
        name   = deployment.name
        region = local.regions[slug]
      }
    }
    api = {
      id           = module.api.id
      name         = module.api.name
      path         = module.api.path
      url          = "${var.platform.api_management.gateway_url}/${module.api.path}"
      named_values = module.api.named_values
    }
    registration = {
      client_id                   = module.registration.client_id
      object_id                   = module.registration.object_id
      service_principal_object_id = module.registration.service_principal_object_id
      federations                 = module.registration.federations
    }
  }
}