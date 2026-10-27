# Asynchronous GitOps operations: infra plan record

Plan: `ai-platform-discovery-docs` `docs/async-operations-plan.md` (§5 contracts, §11 PR-3, build story B28). Direction: D09, revised 25 October 2026, and decision history [25 October 2026](https://github.com/DEFRA/ai-platform-discovery-docs/blob/main/docs/decision-history.md#25-october-2026-asynchronous-gitops-operations-scope-and-build-plan) and [26 October 2026](https://github.com/DEFRA/ai-platform-discovery-docs/blob/main/docs/decision-history.md#26-october-2026-asynchronous-gitops-operations-build-simplified).

This file records what `ai-platform-infra` builds for B28 and what is left. The discovery site carries the design.

## Implemented

| Item              | What                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| PR-3 (a) schemas  | [`schemas/messages/`](../schemas/messages): `command.schema.json` and `event.schema.json` (`aip.gitops.command/1`, `aip.gitops.event/1`), with examples, loaded by `loadMessageValidators`                                                                                                           | `checks/tests/unit/message-schemas.test.js`: every example valid, each required field, enum, pattern and rule refused |
| PR-3 (b) identity | `bootstrap/`: `id-aip-events-{env}` (user-assigned managed identity, no role), four federated credentials (`{env}` and `{env}-events` of both state repositories), the deploy registration's client ID as the token audience, requested through its new identifier URI (v2 tokens, set once by hand) | `bootstrap/tests/bootstrap.tftest.hcl`; `checks/tests/unit/bootstrap-events-identity.test.js` (no role)               |
| Contract page     | [`docs/gitops-contract.md`](gitops-contract.md) rewritten for workflows `v2`: direct commit, `revert`, `expected_base`, events, no `abandon` or pull request                                                                                                                                         | Review                                                                                                                |
| Runbook           | [`docs/bootstrap.md`](bootstrap.md#the-events-identity)                                                                                                                                                                                                                                              | Review                                                                                                                |

## Remaining

| Item                             | Owner             | Notes                                                                                                           |
| -------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Release of this change (`feat:`) | Releaser          | After the user merges; the backend and the worker then re-sync the schemas from the release tag                 |
| Bootstrap in Infradev            | Platform engineer | `terraform apply` of `bootstrap/` by a person; then the Environment variables and CDP's `sqs:SendMessage` grant |
| PR-3b: infra callers to `@v2`    | Platform Engineer | After workflows `v2.0.0` is released                                                                            |
| PR-3 (c), optional               | Platform Engineer | API operations and policy that do not wait for the model deployment; own commit, not in this change             |
