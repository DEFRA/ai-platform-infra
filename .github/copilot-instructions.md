# ai-platform-infra

Public Terraform, schemas, catalogue and `aip-checks` for the AI Platform. It holds no environment values and nothing here is applied by hand. Contract: [docs/gitops-contract.md](../docs/gitops-contract.md), [docs/modules.md](../docs/modules.md).

## Review first

- **Replace or destroy risk.** A renamed address needs a `moved` block, and a team API must render a byte-identical policy unless the change is meant. Flag anything that would replace `cool-team`-style resources. `prevent_destroy` stays on API Management, Foundry, vaults, workspace and state account.
- **Secrets and exposure.** No secret in a state output, variable default or log. Terraform creates no `azurerm_api_management_subscription` or client secret; the backend does. No public ingress added.
- **Names.** Every name comes from `modules/naming`. A team file holds no resource name; the one exception is the platform-owned `research.json`.
- **Credential rules.** Team tier is OAuth only. `subscription-key` is the `research` file's alone, and never authored by a writer App.
- **Idempotent and deterministic.** Role and assignment IDs derive from the environment; repeat applies are a no-op.

## Conventions

- Terraform `.terraform-version`; providers exact-pinned in roots with lock files for linux, darwin and windows; modules state minimum versions. Validated inputs, minimal outputs, tags per `docs/modules.md`, `ignore_changes = [tags["ServiceCode"]]` on tagged resources.
- Every module has `terraform.tf`, `variables.tf`, `main.tf`, `outputs.tf` and a mock-provider test. Test with `terraform -chdir=<dir> test`.
- APIM policy XML: only expressions API Management allows (`policy-expressions.test.js`), escape `&lt;` `&gt;` `&quot;` where XML needs it.
- Schemas change by expand then contract across two releases. A catalogue change needs a release and the backend's `CATALOGUE_REF` moved.
- Update `docs/` and `examples/` with the change; keep Markdown short and Prettier-clean.
- JavaScript in `checks/`: ES modules, named exports, JSDoc on exports, tests beside the rule they pin.

## Pull requests

1. Branch `<type>/<description>` from current `main`; conventional commits (release-please reads them).
2. Before pushing: `terraform fmt -recursive`, `terraform -chdir=<dir> test` for each root and module touched, `npm test --prefix checks`, and Prettier from both `checks/` and the repo root.
3. Open the PR with the template filled in. State what a plan would show; never apply from a PR.
4. **Request Copilot review** once checks are green: `gh pr edit <n> --add-reviewer "@copilot"`. When it lands, fix every comment or reply with the reason it does not apply, push, then resolve each thread (GraphQL `resolveReviewThread`). Re-request after a substantial push and repeat until nothing is unresolved. Copilot is advisory and never replaces the human approval the ruleset requires.
5. Then request a human reviewer. Do not merge your own PR, bypass checks or use `--no-verify`.
