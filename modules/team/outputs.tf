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
      id                    = module.api.id
      name                  = module.api.name
      path                  = module.api.path
      url                   = "${var.platform.api_management.gateway_url}/${module.api.path}"
      subscription_required = module.api.subscription_required
      named_values          = module.api.named_values
    }
    registration = local.oauth ? {
      client_id                   = module.registration[0].client_id
      object_id                   = module.registration[0].object_id
      service_principal_object_id = module.registration[0].service_principal_object_id
      federations                 = module.registration[0].federations
    } : null
  }
}