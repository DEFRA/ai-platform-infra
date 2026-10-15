# ai-platform-infra

Infrastructure code for the Defra AI Platform: Terraform root modules and modules, the model catalogue,
JSON Schemas for the GitOps files, the offline checks, and the bootstrap. Public code, private configuration: this
repository holds no environment values; real values live in the internal `ai-platform-environments` and
in GitHub Environment variables.

Design and plan: `ai-platform-discovery-docs` (IaC baseline plan, designs B, C and D).

| Path                      | What                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| [`platform/`](platform)   | Root module for the platform state of one environment (Phase 1: the public minimal platform) |
| [`bootstrap/`](bootstrap) | One-time per subscription: state account, deploy identity federation, missing roles          |
| [`names/`](names)         | Provider-free root that prints every name for an environment                                 |
| [`modules/`](modules)     | `naming` and the platform modules                                                            |
| [`schemas/`](schemas)     | `team`, `pin`, `registry` and `environment` JSON Schemas                                     |
| [`checks/`](checks)       | `aip-checks`: validate, plan-guard, run-report (Node.js 24)                                  |
| [`catalogue/`](catalogue) | Model providers and models                                                                   |
| [`examples/`](examples)   | Placeholder files laid out by repository; test fixtures for the checks and the Portal API    |
| [`docs/`](docs)           | [GitOps contract](docs/gitops-contract.md), [bootstrap](docs/bootstrap.md)                   |

## Versions

Terraform `1.16.5` (`.terraform-version`), `azurerm` `5.9.0`, `azapi` `2.13.0` and `azuread` `3.10.0`, pinned
exactly in each root with committed lock files. `compat.json` states the oldest `ai-platform-workflows`
release this release works with.

## Releases

Conventional commits; release-please tags `vX.Y.Z` on merge, and the release workflow submits the pin of
every registry entry with `autoPin`, so a merge reaches Infradev with no manual step. A release publishes
nothing to an environment by itself.

## Checks

Pull requests run `infra-checks / validate`, `lint`, `schemas`, `catalogue` and `security` (a checkov scan
into code scanning, soft-fail until the Phase 1 findings are triaged) from `ai-platform-workflows`. Locally:

```sh
bash ../ai-platform-workflows/scripts/infra-checks.sh   # fmt, validate every root, terraform test
tflint --init && tflint --recursive --config "$PWD/.tflint.hcl"
npm ci --prefix checks && npm test --prefix checks && npm run lint --prefix checks
```

Licence: [Open Government Licence v3](LICENCE).
