locals {
  slug  = var.team.team.slug
  oauth = var.team.gateway.credentialType == "oauth"

  # Catalogue providers whose models Foundry deploys, and the model format
  # Foundry expects for each.
  model_formats = {
    openai = "OpenAI"
  }

  primary_region = one([
    for region, account in var.platform.foundry_accounts : region if account.primary
  ])
  primary = var.platform.foundry_accounts[local.primary_region]

  deployments = {
    for deployment in var.team.deployments : deployment.slug => {
      deployment = deployment
      model      = var.catalogue[deployment.slug]
      sku = one([
        for sku in var.catalogue[deployment.slug].skus : sku
        if sku.name == deployment.sku && contains(try(sku.tiers, ["research"]), "team")
      ])
    }
  }

  regions = {
    for slug, item in local.deployments : slug => [
      for region in item.sku.regions : region
      if contains(keys(var.platform.foundry_accounts), region)
    ][0]
  }

  tags = merge(var.tags, {
    aip-team         = local.slug
    aip-service-code = var.team.team.serviceCode
    aip-operation-id = var.source_commit.operation_id
    aip-source-sha   = var.source_commit.sha
  })

  # A CDP federation names only its service; the environment's registry
  # entry supplies the rest, so a team file is the same in every environment.
  federations = local.oauth ? [
    for federation in var.team.oauth.federations : federation.host == "cdp" ? {
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
  ] : []

  client_ids = local.oauth ? concat(
    [module.registration[0].client_id],
    [for client in var.team.oauth.externalClients : client.clientId],
  ) : []
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
  for_each = local.deployments

  name       = format(var.names.deployment, local.slug, each.key)
  account_id = var.platform.foundry_accounts[local.regions[each.key]].id
  sku        = each.value.deployment.sku
  capacity   = each.value.deployment.capacity

  model = {
    format  = local.model_formats[each.value.model.provider]
    name    = each.value.model.modelName
    version = each.value.model.version
  }
}

module "registration" {
  source = "../entra-team-app"
  count  = local.oauth ? 1 : 0

  display_name     = format(var.names.registration, local.slug)
  owner_object_ids = var.owner_object_ids
  team_slug        = local.slug
  environment      = var.environment
  federations      = local.federations
}


module "api" {
  source = "../apim-team-api"

  team_slug          = local.slug
  api_name           = format(var.names.api, local.slug)
  api_management     = var.platform.api_management
  credential_type    = var.team.gateway.credentialType
  client_ids         = local.client_ids
  authorise_fragment = var.platform.authorise_fragment

  named_values = {
    clients       = format(var.names.clients_named_value, local.slug)
    access_window = format(var.names.access_window_named_value, local.slug)
  }

  limits = {
    tokens_per_minute   = var.team.gateway.limits.tokensPerMinute
    requests_per_minute = var.team.gateway.limits.requestsPerMinute
  }

  models = [
    for slug in var.team.gateway.allowedDeployments : {
      slug            = slug
      deployment_name = module.deployment[slug].name
      endpoint        = var.platform.foundry_accounts[local.regions[slug]].openai_endpoint
      api_profile     = var.catalogue[slug].apiProfile
    }
  ]
}