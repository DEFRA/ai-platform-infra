# Modules

Every root reads its names from [`naming`](../modules/naming); no module, parameters file or team file
writes a resource name. Modules state minimum provider versions; roots pin exact versions. Every module
has `terraform.tf`, `variables.tf`, `main.tf` and `outputs.tf` (roots add `providers.tf` and
`backend.tf`, as the [HashiCorp style guide](https://developer.hashicorp.com/terraform/language/style)
names them), and takes everything environment-specific as input, so moving to another environment is
a parameters change only.

## Roots and parameters

| Root        | State               | Reads                                                                                                                           |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `names`     | None (local)        | `params_file`: the merged parameters below                                                                                      |
| `bootstrap` | `bootstrap.tfstate` | `params_file` (through `names`), plus the deploy identity's inputs                                                              |
| `platform`  | `platform.tfstate`  | `-var-file` the merged parameters; `release`, `entra_enabled`                                                                   |
| `tenants`   | `tenants.tfstate`   | The platform state's outputs, the team files bundled by `aip-checks`, the registry entry's `cdp` trust and `team_registrations` |

Parameters live in `ai-platform-environments`: `global.tfvars.json` holds what every environment
shares and `environments/{env}/platform.tfvars.json` the environment's own. Codes every cloud shares sit
at the top level (`environment`, `service_code`, `naming`); what is specific to Azure sits under
`azure` (location, network, API Management with its publisher, Foundry regions, Key Vault, Log
Analytics, Application Insights, identities), and another cloud gets its own key beside it, read by its
own root. `aip-checks params` deep-merges the two files, so an environment sets `azure.apim.sku` without
restating the rest of `azure`, validates the result against
[`environment.schema.json`](../schemas/environment.schema.json) and writes the one file Terraform
reads. No value is interpolated: names come from the codes through `naming`. Before the gate before
DEV, `azure.existing_resource_group` may name a CCoE resource group made in advance; the platform and its
state then go into it.

Diagnostic settings for every platform resource, and the subscription activity log, are in one place:
[`platform/diagnostics.tf`](../platform/diagnostics.tf).

| Module                                                        | Creates                                                                                                                                                                                                                                                                                         | Used by                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| [`naming`](../modules/naming)                                 | Nothing: CCoE names and team format strings                                                                                                                                                                                                                                                     | Every root              |
| [`roles`](../modules/roles)                                   | Nothing: built-in role definition IDs, the only place a role GUID appears                                                                                                                                                                                                                       | `platform`, `bootstrap` |
| [`log-analytics`](../modules/log-analytics)                   | Log Analytics (local auth off), workspace-based Application Insights (local auth off)                                                                                                                                                                                                           | `platform`              |
| [`key-vault`](../modules/key-vault)                           | A vault with RBAC, purge protection and data-plane roles                                                                                                                                                                                                                                        | `platform`              |
| [`apim`](../modules/apim)                                     | API Management, Entra-authenticated logger, W3C diagnostics without bodies, named values, the global layer (tier from the API path, `aip-authorise`, the gate) and the shared fragments                                                                                                         | `platform`              |
| [`foundry-account`](../modules/foundry-account)               | A Foundry (AI Services) account per region, local auth off; the gateway as Foundry User                                                                                                                                                                                                         | `platform`              |
| [`entra-api-audience`](../modules/entra-api-audience)         | `api-aip-{env}`: v2 tokens with `idtyp`, identifier URI, service principal                                                                                                                                                                                                                      | `platform`              |
| [`team`](../modules/team)                                     | One team: the four modules below, tagged with the team, service code, operation and source commit; deploys each model on its catalogue offering's hosting platform. The platform-owned `research` file is built by the same module as a key team: no registration, deployments named as written | `tenants`               |
| [`foundry-project`](../modules/foundry-project)               | The team's Foundry project in the primary account                                                                                                                                                                                                                                               | `team`                  |
| [`foundry-deployment`](../modules/foundry-deployment)         | A pinned, non-Global deployment in the account of the SKU's region                                                                                                                                                                                                                              | `team`                  |
| [`apim-team-api`](../modules/apim-team-api)                   | The API at `/{slug}`, its operations and short policy; for an OAuth API its client list and access window named values. With `credential_type` `subscription-key` (the `research` API only) it requires a subscription and takes no named values                                                | `team`                  |
| [`apim-subscription-role`](../modules/apim-subscription-role) | The custom role the Portal API needs to mint research subscriptions (subscription actions only, no APIs, policies or products), its assignment on API Management, and an explicit wait for the definition to propagate. Creates no subscription                                                 | `platform`              |
| [`entra-team-app`](../modules/entra-team-app)                 | `app-aip-{env}-{slug}` with federated credentials; ignores passwords and `account_enabled`                                                                                                                                                                                                      | `team`                  |

The platform root also creates one named API Management backend per Foundry account
(`aip-foundry-{region}`), which a team API selects by ID; a future hosting platform adds its own
backends, its own deployment module and its own backend fragment, and no team file changes.

`prevent_destroy` protects API Management, the Foundry accounts, both vaults, the workspace and the state
account; the bootstrap adds `CanNotDelete` locks to the vaults, the workspace and the state account
([bootstrap](bootstrap.md)). Tests run with mock providers: `terraform -chdir=<dir> test`.

## Naming

[`naming`](../modules/naming) reproduces Defra's CCoE pattern
`{SubType}{Svc}{Role}{ResType}{EnvInstance}{Region}{Instance}` (DEFRA/plt-infrastructure-core
`resources/naming-convention`), with the environment's codes from `ai-platform-environments`. For
Infradev (`SND`, `AIP`, `1`, UK South):

| Resource                    | Name                                   |
| --------------------------- | -------------------------------------- |
| Platform resource group     | `SNDAIPINFRGP1401`                     |
| State resource group        | `SNDAIPINFRGP1402`                     |
| State storage account       | `sndaipinfsto1401`                     |
| Log Analytics               | `SNDAIPAPPLW1401`                      |
| Application Insights        | `SNDAIPAPPAIS1401`                     |
| Platform and tenants vaults | `sndaipappkvt1401`, `sndaipappkvt1402` |

Gaps raised with CCoE: `AIP` is not yet in CCoE's service code list, and CCoE has no type code for API
Management, Foundry accounts, projects and deployments, API Management children or Entra registrations.
Those use design D's logical labels (`apim-aip-infradev`, `aif-aip-infradev`, `aif-aip-infradev-swc`,
`aip-{slug}`, `{slug}-{model}`, `app-aip-infradev-{slug}`) until CCoE publishes codes.

## Gateway policy

Policy is layered the way API Management evaluates it, global then API, with `<base />` joining them
(design E `#enforcement`, rewritten to two layers on 19 October 2026, plan `gateway-auth-layers-plan.md` in
`ai-platform-discovery-docs`). The global layer authenticates every call and holds no team data; a team
policy runs after `<base />` and can only narrow access.

| Layer                             | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global policy (`apim`)            | G1: the tier from `context.Api.Path` against `key_tier_paths` (`research` by default; every other path is OAuth), so a lower policy cannot change it. Then `aip-key-guard` (G2) or `aip-authorise` (G3 to G6), then `aipAuthenticated`. The `backend` section is the gate: a request no lower layer marked `aipGrantedCall` gets 403 `client-not-granted` before `forward-request`, so an API with no team policy reaches no model. `on-error` adds `WWW-Authenticate` to a `validate-jwt` failure. Response header hygiene                                                                                                                                                                                                                                                                                                              |
| Shared fragments (`apim`)         | `aip-authorise`: G3 a subscription key on a token path or an oversized header, G4 `validate-jwt` (v2 configuration, issuer, audience, `tid`, `ver`, `Bearer`, 60 seconds of skew), G5 `RS256`, at most 2 hours from `iat` to `exp`, `azp`, `azpacr` not `0`, `idtyp` `app` unless the path is in `delegated_paths` (empty), G6 the deny list; all 401 `invalid-token` with `WWW-Authenticate` or 403 `client-not-granted`. `aip-team-grant`: T1 the client list (403 `client-not-granted`) and T2 the access window (403 `grant-suspended` or `grant-expired`). `aip-whoami`; `aip-request-model` (refuses a call the global layer did not mark, 401 `not-authorised`, then reads the requested slug); `aip-backend-foundry` (strips the caller's credentials, authenticates as the gateway, rewrites the slug to the team's deployment) |
| Team API policy (`apim-team-api`) | After `<base />`: the team's data (`aipTeam`, client list, access window, grants), `aip-team-grant`, the shared steps, the generated model routing to a named backend (T4, 403 `model-not-granted`, and the `aipGrantedCall` mark for a granted model), the request and token limits (T5), and the token metric; `tokens-per-minute` takes no policy expression, so the limits are generated per team. T3, refusing a secret-based token, waits for design E verify 10                                                                                                                                                                                                                                                                                                                                                                   |

Callers name a catalogue slug, in the path (`/openai/deployments/{slug}/chat/completions`) or
the body `model`. Prompt and response logging stays off (design G).

The `research` API is the same module with `credential_type` `subscription-key`, generated from the
platform-owned `research` team file. Its path is on the key-tier list, so the global policy runs
`aip-key-guard`, and it requires an API-scoped subscription, which the backend mints per person; Terraform
creates none. It has no team layer: the subscription is the caller. Nothing translates the name: the policy skips `aip-request-model`, checks the deployment
name the caller sent (the imported spec's path) against `allowedDeployments` and forwards it as sent, so
that name is written in the research file and carried in the catalogue's `deploymentName`. The token and
request counters are keyed by the caller's subscription, not the API, so each person has an allowance.

Rollout order: apply `platform` first (new fragment, global policy, fragments), then `tenants` (each team
policy). Between the two every team API answers 403 `client-not-granted` at the gate, because the old team
policies do not mark a granted call. The probe that proves the policy constructs on a real gateway is in
[gateway-authorisation-probe.md](gateway-authorisation-probe.md).
