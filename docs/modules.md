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

| Module                                                | Creates                                                                                                                                                            | Used by                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| [`naming`](../modules/naming)                         | Nothing: CCoE names and team format strings                                                                                                                        | Every root              |
| [`roles`](../modules/roles)                           | Nothing: built-in role definition IDs, the only place a role GUID appears                                                                                          | `platform`, `bootstrap` |
| [`log-analytics`](../modules/log-analytics)           | Log Analytics (local auth off), workspace-based Application Insights (local auth off)                                                                              | `platform`              |
| [`key-vault`](../modules/key-vault)                   | A vault with RBAC, purge protection and data-plane roles                                                                                                           | `platform`              |
| [`apim`](../modules/apim)                             | API Management, Entra-authenticated logger, W3C diagnostics without bodies, named values, the global guard and the shared fragments                                | `platform`              |
| [`foundry-account`](../modules/foundry-account)       | A Foundry (AI Services) account per region, local auth off; the gateway as Foundry User                                                                            | `platform`              |
| [`entra-api-audience`](../modules/entra-api-audience) | `api-aip-{env}`: v2 tokens with `idtyp`, identifier URI, service principal                                                                                         | `platform`              |
| [`team`](../modules/team)                             | One team: the four modules below, tagged with the team, service code, operation and source commit; deploys each model on its catalogue offering's hosting platform | `tenants`               |
| [`foundry-project`](../modules/foundry-project)       | The team's Foundry project in the primary account                                                                                                                  | `team`                  |
| [`foundry-deployment`](../modules/foundry-deployment) | A pinned, non-Global deployment in the account of the SKU's region                                                                                                 | `team`                  |
| [`apim-team-api`](../modules/apim-team-api)           | The API at `/{slug}`, its operations, client list and access window named values, and its short policy                                                             | `team`                  |
| [`entra-team-app`](../modules/entra-team-app)         | `app-aip-{env}-{slug}` with federated credentials; ignores passwords and `account_enabled`                                                                         | `team`                  |

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
(direction 18 October 2026, design C `#model-access`):

| Layer                             | Holds                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global policy (`apim`)            | The guard: `aip-key-guard` for an API that declared `aipCredentialType` `key` (the Research tier, when it arrives), `aip-authorise` for every other API, then `aipAuthorised`; `forward-request`; response header hygiene. An API with no policy of its own is still OAuth-guarded                                                                                                                                   |
| Shared fragments (`apim`)         | `aip-authorise` (design E: token 401, client list and deny list 403 `client-not-granted`, access window 403 `grant-suspended` or `grant-expired`); `aip-whoami`; `aip-request-model` (refuses a call the guard did not mark, 401 `not-authorised`, then reads the requested slug); `aip-backend-foundry` (strips the caller's credentials, authenticates as the gateway, rewrites the slug to the team's deployment) |
| Team API policy (`apim-team-api`) | The team's facts as variables before `<base />` (`aipTeam`, `aipCredentialType` `oauth`, client list, access window, grants), then the shared steps, the generated model routing to a named backend (403 `model-not-granted`), the request and token limits, and the token metric; `tokens-per-minute` takes no policy expression, so the limits are generated per team                                              |

Callers name a catalogue slug, in the path (`/openai/deployments/{slug}/chat/completions`) or
the body `model`. Prompt and response logging stays off (design G).
