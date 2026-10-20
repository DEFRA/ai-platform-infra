# Terraform quality plan

Brings every root and module up to [terraform.instructions.md](../.github/instructions/terraform.instructions.md) so the
code is production-ready. Out of scope: resource security and network settings (public access and the other approved
exceptions in design D), the blocking checkov job, and plans before merge (build story B25). Build story B26 in
`ai-platform-discovery-docs` tracks this plan; built state is recorded there.

## Findings (20 October 2026, `v0.9.0`)

Already at the bar: standard files in every module, provider blocks in roots only, names from `naming`; Terraform
1.16.5, providers exact-pinned in roots with committed multi-platform lock files and `-lockfile=readonly`; `count`
only as a switch, `for_each` on stable keys, `moved` blocks, no `timestamp()`, `uuid()` or local-exec; `ignore_changes`
only on values the Portal API or Azure Policy owns; Entra-only state, separate platform and tenants states, saved
plans and `plan-guard`; 9 test suites with 62 runs on mock providers.

| #   | Finding                                                                                                                                                                                                                                                                                                                                    | Breaches                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| T1  | 40 variables and about 35 outputs have no description (for example 11 of 16 in `modules/apim/variables.tf`, 8 of 15 platform outputs)                                                                                                                                                                                                      | Every input and output described          |
| T2  | No tests of their own for `foundry-account`, `foundry-deployment`, `foundry-project`, `log-analytics`, `entra-team-app`, `entra-api-audience`, `roles` or `team` (`team` is exercised only through `tenants/tests`)                                                                                                                        | No untested HCL                           |
| T3  | Validations with no failing run: `foundry-account`, `foundry-deployment`, `log-analytics`, `entra-team-app`, `key-vault`, one of `apim`'s two, `naming.environment`, `apim-subscription-role.name`, `team.platform`, and validations in both roots (for example the platform principal GUID, and the tenants slug, environment and status) | Every validation has a negative test      |
| T4  | Nothing enforces T1 to T3: tflint runs the `recommended` preset, and `infra-checks.sh` tests only folders that have `tests/`                                                                                                                                                                                                               | Clean tools                               |
| T5  | Module tests run `init` without a lock file, so their provider versions float within the module's range                                                                                                                                                                                                                                    | Reproducible results                      |
| T6  | The tenants root reads ten platform outputs through `terraform_remote_state`, with no test of that contract, and refuses any release but the platform's (`platform_release`)                                                                                                                                                               | Independent deploys (promotion plan P1)   |
| T7  | Leaf modules take unchecked inputs the settings schema bounds only upstream (for example `capacity` in `apim` and `foundry-deployment`, `sampling_percentage`, `daily_quota_gb`), so a module reused from another root has no guard                                                                                                        | Validation where an input can be wrong    |
| T8  | `prevent_destroy` carries no one-line reason in `apim`, `foundry-account`, `key-vault`, `log-analytics` or `bootstrap`                                                                                                                                                                                                                     | Lifecycle exceptions carry a reason       |
| T9  | The standard says checkov passes and no output is sensitive, while checkov soft-fails and `log-analytics` outputs a sensitive connection string to `apim`                                                                                                                                                                                  | The standard contradicts the code         |
| T10 | Application owners and the platform vault's deploy role take `azurerm_client_config.current.object_id`, so a plan as another identity (the read-only plan identity of B25) proposes different principals                                                                                                                                   | Results independent of who runs Terraform |

## Work items

| ID  | Change                                                                                                                                                                                                                                                                                            | Closes |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Q1  | Describe every variable and output; tflint `preset = "all"`, with any rule disabled in `.tflint.hcl` only beside a one-line reason                                                                                                                                                                | T1, T4 |
| Q2  | A test suite per module in T2, `team` included, asserting every resource, output and branch; and a failing run beside a passing one for every validation in T3, added to existing module and root suites where they exist                                                                         | T2, T3 |
| Q3  | `aip-checks terraform-coverage`: fails when a module or root has no `tests/`, or a `validation` or `precondition` has no `expect_failures` run; called from `infra-checks.sh` in `ai-platform-workflows`                                                                                          | T4     |
| Q4  | Module tests initialise at the provider versions the roots pin (a lock file per tested module, checked equal to the roots' by `aip-checks`)                                                                                                                                                       | T5     |
| Q5  | A platform test asserting each output the tenants root reads, with its type; the tenants tests mock exactly that set; the `platform_release` precondition becomes a check against the applied platform release's compatibility, tested with different compatible releases and an incompatible one | T6     |
| Q6  | Validations on leaf-module inputs that can plan wrongly, each with its negative test                                                                                                                                                                                                              | T7     |
| Q7  | A one-line reason on each `prevent_destroy`                                                                                                                                                                                                                                                       | T8     |
| Q8  | Done in #21: the standard says checkov is deferred until its findings are triaged, and a sensitive output may pass between modules but never from a root (`platform/outputs.tf` outputs nothing sensitive today)                                                                                  | T9     |
| Q9  | The deploy identity's object ID becomes a root input, passed identically to plan and apply, replacing the caller lookups (promotion plan P4)                                                                                                                                                      | T10    |

Order: Q7 (small), Q1, Q2 with Q6, then Q3 and Q4 to keep it that way. Q5 and Q9 land with promotion plan P1 and P4. Every
item is a code or test change with no planned change to Azure: a pull request states "no resource changes".

## Verification

1. From the repository root, `tflint --recursive --config "$PWD/.tflint.hcl"` passes at the `all` preset (the
   absolute path, as CI passes it, so child modules use the root configuration), and no variable or output lacks a
   description.
2. `aip-checks terraform-coverage` passes, and fails on a fixture module without tests and on a fixture validation
   without a failing run.
3. Every module's tests pass at the roots' pinned provider versions.
4. Removing an output the tenants root reads fails the platform tests.
5. A plan of Infradev after each item shows no change.
