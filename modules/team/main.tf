locals {
  slug = var.team.team.slug

  # The platform-owned research team is the one that holds subscription keys:
  # same project, account-child deployments and generated API as any team,
  # but its callers send the deployment name itself, so nothing derives it.
  key_tier = var.team.gateway.credentialType == "subscription-key"
  tier     = local.key_tier ? "research" : "team"

  # Catalogue providers whose models Foundry deploys, and the model format
  # Foundry expects for each.
  model_formats = {
    openai = "OpenAI"
  }

  primary_region = one([
    for region, account in var.platform.foundry_accounts : region if account.primary
  ])
  primary = var.platform.foundry_accounts[local.primary_region]

  # A deployment's hosting platform is the catalogue offering's, resolved by
  # the tenants root; each platform has its own deployment module below and
  # its own backend fragment at the gateway (design C #model-access).
  deployments = {
    for deployment in var.team.deployments : deployment.slug => {
      deployment = deployment
      model      = var.catalogue[deployment.slug]
      hosting    = var.catalogue[deployment.slug].hosting.platform
      sku = one([
        for sku in var.catalogue[deployment.slug].skus : sku
        if sku.name == deployment.sku && contains(try(sku.tiers, ["research"]), local.tier)
      ])
    }
  }

  foundry_deployments = {
    for slug, item in local.deployments : slug => item if item.hosting == "foundry"
  }

  regions = {
    for slug, item in local.foundry_deployments : slug => [
      for region in item.sku.regions : region
      if contains(keys(var.platform.foundry_accounts), region)
    ][0]
  }

  # Deployment names and the gateway backend each slug routes to, by hosting.
  # A team's are derived; the research file's are the public contract.
  deployment_names = { for slug, deployment in module.deployment : slug => deployment.name }
  backend_ids = {
    for slug, item in local.foundry_deployments : slug => var.platform.backends.foundry[local.regions[slug]]
  }

  # allowedDeployments lists catalogue slugs in a team file and deployment
  # names in the research file; the API module wants the slug of each.
  slug_by_deployment_name = { for slug, item in local.deployments : item.deployment.deploymentName => slug if local.key_tier }
  granted_slugs           = [for entry in var.team.gateway.allowedDeployments : local.key_tier ? local.slug_by_deployment_name[entry] : entry]

  tags = merge(var.tags, {
    aip-team         = local.slug
    aip-service-code = var.team.team.serviceCode
    aip-operation-id = var.source_commit.operation_id
    aip-source-sha   = var.source_commit.sha
  })

  # A CDP federation names only its service; the environment's registry
  # entry supplies the rest, so a team file is the same in every environment.
  federations = [
    for federation in try(var.team.oauth.federations, []) : federation.host == "cdp" ? {
      name     = federation.name
      issuer   = var.cdp.issuer
      subject  = "arn:aws:iam::${var.cdp.awsAccount}:role/${federation.service}"
      audience = var.cdp.audience
      } : {
      name     = federation.name
      issuer   = federation.issuer
      subject  = federation.subject
      audience = "api://AzureADTokenExchange"
    }
  ]

  client_ids = concat(
    module.registration[*].client_id,
    [for client in try(var.team.oauth.externalClients, []) : client.clientId],
  )
}

# Blocking: a deployment on a hosting platform this release has no module
# for fails the plan with its name, rather than silently deploying nothing.
resource "terraform_data" "hosting_supported" {
  input = [for slug, item in local.deployments : "${slug}:${item.hosting}"]

  lifecycle {
    precondition {
      condition = alltrue([
        for item in local.deployments : contains(keys(var.platform.backends), item.hosting)
      ])
      error_message = "Team ${local.slug} grants a model on a hosting platform this release does not deploy: ${join(", ", [for slug, item in local.deployments : "${slug} (${item.hosting})" if !contains(keys(var.platform.backends), item.hosting)])}."
    }

    precondition {
      condition     = alltrue([for item in local.foundry_deployments : item.deployment.capacity != null])
      error_message = "A Foundry deployment needs capacity: ${join(", ", [for slug, item in local.foundry_deployments : slug if item.deployment.capacity == null])}."
    }
  }
}

module "project" {
  source = "../foundry-project"

  name       = format(var.names.project, local.slug)
  account_id = local.primary.id
  location   = local.primary_region
  team_slug  = local.slug
  tags       = local.tags
}

module "deployment" {
  source   = "../foundry-deployment"
  for_each = local.foundry_deployments

  name       = local.key_tier ? each.value.deployment.deploymentName : format(var.names.deployment, local.slug, each.key)
  account_id = var.platform.foundry_accounts[local.regions[each.key]].id
  sku        = each.value.deployment.sku
  capacity   = each.value.deployment.capacity

  model = {
    format  = local.model_formats[each.value.model.provider]
    name    = each.value.model.modelName
    version = each.value.model.version
  }

  depends_on = [terraform_data.hosting_supported]
}

module "registration" {
  source = "../entra-team-app"
  count  = var.registration_enabled && !local.key_tier ? 1 : 0

  display_name     = format(var.names.registration, local.slug)
  owner_object_ids = var.owner_object_ids
  team_slug        = local.slug
  environment      = var.environment
  federations      = local.federations
}


module "api" {
  source = "../apim-team-api"

  team_slug       = local.slug
  api_name        = format(var.names.api, local.slug)
  credential_type = var.team.gateway.credentialType
  api_management  = var.platform.api_management
  client_ids      = local.client_ids
  fragments       = var.platform.fragments

  named_values = {
    clients       = format(var.names.clients_named_value, local.slug)
    access_window = format(var.names.access_window_named_value, local.slug)
  }

  limits = {
    tokens_per_minute   = var.team.gateway.limits.tokensPerMinute
    requests_per_minute = var.team.gateway.limits.requestsPerMinute
  }

  models = [
    for slug in local.granted_slugs : {
      slug            = slug
      deployment_name = local.deployment_names[slug]
      hosting         = local.deployments[slug].hosting
      backend_id      = local.backend_ids[slug]
      api_profile     = var.catalogue[slug].apiProfile
    }
  ]
}