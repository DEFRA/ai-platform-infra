---
description: 'Use when writing, changing or reviewing Terraform (*.tf, *.tftest.hcl) in this repo: HashiCorp and community best practices, and the testing every piece of HCL must have locally and in CI.'
applyTo: '**/*.tf,**/*.tftest.hcl,**/*.tfvars'
---

# Terraform best practices and testing

References: [HashiCorp style guide](https://developer.hashicorp.com/terraform/language/style), [Terraform tests](https://developer.hashicorp.com/terraform/language/tests), [terraform-best-practices.com](https://www.terraform-best-practices.com/), [Spacelift](https://spacelift.io/blog/terraform-best-practices), [10 practices that matter](https://medium.com/@pawel.piwosz/10-terraform-best-practices-that-actually-matter-55b73afb2923). When these disagree with `docs/modules.md`, the repo wins.

## Practices (flag a breach in review)

- **Layout and naming.** Standard files (`terraform.tf`, `variables.tf`, `main.tf`, `outputs.tf`), one concern per small module, `snake_case`, a single resource of a kind is `this`, no provider blocks in modules. Names come from `modules/naming`, never literals.
- **Inputs and outputs.** Every variable has a type, description and, where it can be wrong, a `validation`. No environment-specific defaults. Outputs are minimal, described, and never a secret or sensitive value.
- **Versions.** `required_version` set; providers exact-pinned in roots with a committed lock file covering linux, darwin and windows; modules give a minimum range.
- **Safe change.** `for_each` over maps with stable keys; `count` only as an on/off switch. Use a `moved` block for any address change and say what a plan will show. `lifecycle` exceptions (`ignore_changes`, `prevent_destroy`) carry a one-line reason. No `-target`, no local-exec, no apply from a PR.
- **Secrets.** None in code, variables, outputs or state beyond what the provider forces. Prefer identities and RBAC over keys.
- **Clean tools.** `terraform fmt`, `validate`, tflint and checkov pass; a new checkov skip needs a reason.

## Testing: every piece of HCL is automated and tested

Run locally with `terraform -chdir=<dir> test`, and in CI through `infra-checks.sh`. Offline only: `mock_provider` and overrides, never live Azure. A PR with untested HCL is incomplete.

- **Positive.** Assert the values a plan or apply produces (names, scopes, settings, rendered policy), not just that it plans. Every resource, output and conditional branch is asserted.
- **Negative.** Every `validation` and `precondition` has a `run` with `expect_failures` for the input that should fail, and a passing case beside it.
- **Edge.** Empty and null inputs, minimum and maximum bounds, `count = 0` and empty `for_each` branches, existing versus new resource group, each environment, removed or legacy shapes, and repeat applies (deterministic IDs).
- **Rendered output.** Templated policy, JSON or XML is tested as text. A change meant to leave existing callers alone proves the old rendering is unchanged.
- **Regression.** A bug fix adds a test that fails without the fix.
- **Coverage by review.** Terraform has no coverage tool, so list in the PR which resources, validations and branches the tests cover.
