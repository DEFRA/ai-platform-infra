# Modules

Every root reads its names from [`naming`](../modules/naming); no module, parameters file or team file
writes a resource name. Modules state minimum provider versions; roots pin exact versions. Every module
has `terraform.tf`, `variables.tf`, `main.tf` and `outputs.tf` (roots add `providers.tf` and
`backend.tf`, as the [HashiCorp style guide](https://developer.hashicorp.com/terraform/language/style)
names them), and takes everything environment-specific as input, so moving to another environment is
a parameters change only.

## Roots and parameters

| Root        | State               | Reads                                                                                                      |
| ----------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `names`     | None (local)        | `config_files`: the layered parameters below                                                               |
| `bootstrap` | `bootstrap.tfstate` | `config_files` (through `names`), plus the deploy identity's inputs                                        |
| `platform`  | `platform.tfstate`  | `-var-file` global, then the environment's file; `release`, `entra_enabled`                                |
| `tenants`   | `tenants.tfstate`   | The platform state's outputs, the team files bundled by `aip-checks`, and the registry entry's `cdp` trust |

Parameters are layered in `ai-platform-environments`: `global.tfvars.json` holds what every environment
shares (location, service code, API Management publisher, default Foundry regions) and
`environments/{env}/platform.tfvars.json` holds the environment's own. Terraform reads them in that order
with `-var-file`, so an environment overrides a whole top-level key; `aip-checks` validates the merged
result against [`environment.schema.json`](../schemas/environment.schema.json). No value is interpolated:
names come from the codes through `naming`. Before the gate before DEV, `existing_resource_group` may name
a CCoE resource group made in advance; the platform and its state then go into it.

Diagnostic settings for every platform resource, and the subscription activity log, are in one place:
[`platform/diagnostics.tf`](../platform/diagnostics.tf).

| Module                                                | Creates                                                                                                   | Used by                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------- |
| [`naming`](../modules/naming)                         | Nothing: CCoE names and team format strings                                                               | Every root              |
| [`roles`](../modules/roles)                           | Nothing: built-in role definition IDs, the only place a role GUID appears                                 | `platform`, `bootstrap` |
| [`log-analytics`](../modules/log-analytics)           | Log Analytics (local auth off), workspace-based Application Insights (local auth off)                     | `platform`              |
| [`key-vault`](../modules/key-vault)                   | A vault with RBAC, purge protection and data-plane roles                                                  | `platform`              |
| [`apim`](../modules/apim)                             | API Management, Entra-authenticated logger, W3C diagnostics without bodies, named values, `aip-authorise` | `platform`              |
| [`foundry-account`](../modules/foundry-account)       | A Foundry (AI Services) account per region, local auth off; the gateway as Foundry User                   | `platform`              |
| [`entra-api-audience`](../modules/entra-api-audience) | `api-aip-{env}`: v2 tokens with `idtyp`, identifier URI, service principal                                | `platform`              |
| [`team`](../modules/team)                             | One team: the four modules below, tagged with the team, service code, operation and source commit         | `tenants`               |
| [`foundry-project`](../modules/foundry-project)       | The team's Foundry project in the primary account                                                         | `team`                  |
| [`foundry-deployment`](../modules/foundry-deployment) | A pinned, non-Global deployment in the account of the SKU's region                                        | `team`                  |
| [`apim-team-api`](../modules/apim-team-api)           | The API at `/{slug}`, its operations, client list and access window named values, and generated policy    | `team`                  |
| [`entra-team-app`](../modules/entra-team-app)         | `app-aip-{env}-{slug}` with federated credentials; ignores passwords and `account_enabled`                | `team`                  |

`prevent_destroy` protects API Management, the Foundry accounts, both vaults, the workspace and the state
account. Tests run with mock providers: `terraform -chdir=<dir> test`.

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

Team APIs follow design E `#enforcement`. OAuth teams run the shared `aip-authorise` fragment: token
(401), client list and deny list (403 `client-not-granted`), access window (403 `grant-suspended` or
`grant-expired`). Every team then gets the model allow-list (403 `model-not-granted`), request and token
limits, the token metric, and a call to Foundry as the gateway's identity with the caller's credentials
removed. Callers name a catalogue slug, in the path (`/openai/deployments/{slug}/chat/completions`) or
the body `model`; the policy rewrites it to the team's derived deployment. Prompt and response logging
stays off (design G).
