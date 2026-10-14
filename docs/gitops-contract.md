# GitOps contract

The interface between the Portal API, the machine-written repositories and the apply workflows.
Schemas in [`schemas/`](../schemas) and the checks in [`checks/`](../checks) are the executable form;
this page explains them. Design source: the IaC baseline plan and designs B and C in
`ai-platform-discovery-docs`.

## Repositories and files

| Repository                        | File                                                            | Written by                   | Schema                                                                         |
| --------------------------------- | --------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `ai-platform-tenants` (internal)  | `environments/{env}/{slug}.json`                                | `submit` as the GitHub App   | [`team`](../schemas/team.schema.json)                                          |
| `ai-platform-deployments` (int.)  | `environments/{env}/platform.json`                              | `submit` as the GitHub App   | [`pin`](../schemas/pin.schema.json)                                            |
| `ai-platform-environments` (int.) | `registry.json`                                                 | Platform engineers, reviewed | [`registry`](../schemas/registry.schema.json)                                  |
| `ai-platform-environments` (int.) | `global.tfvars.json`, `environments/{env}/platform.tfvars.json` | Platform engineers, reviewed | [`environment`](../schemas/environment.schema.json), against the merged result |

Placeholder copies of each live in [`examples/`](../examples), laid out by repository. They are
schema-valid and are the test fixtures for the checks and the Portal API.

## Every machine-written file

- Whole documents only; nobody edits one in place.
- Canonical serialisation: keys sorted at every level, two-space indent, LF, one trailing newline
  ([`canonical-json.js`](../checks/src/canonical-json.js)). The Portal API and `submit` must produce
  identical bytes.
- Under 60 KB, because a dispatch input holds at most 65,535 characters.
- No secret and no personal data: inputs and files are readable by everyone who can read the
  repository. `updatedBy` and `requestedBy` name exactly one identity and never a name or email
  address (see [traceability](#traceability)).
- No resource names. The Terraform `naming` module derives every name from CCoE's pattern and the
  environment's codes; see [traceability](#traceability).

## Team file

The fields are design C's desired-state schema, with three changes agreed on 13 October 2026:
`project.name` and `deployments[].deploymentName` are dropped because names are derived, and
`gateway.allowedDeployments` lists catalogue slugs, which the gateway maps to derived deployment
names.

Rules beyond the schema, enforced by `validate`:

- File name equals `team.slug`; folder equals `environment`, which must be a registry entry.
- `revision` increases on every write; `operationId` equals the `op/{operationId}` branch.
- Each deployment's catalogue model has tier `team`, lists the environment, is `available` or
  `eligible` (a `deprecated` model keeps existing grants only) and offers the SKU for the `team` tier
  in a region the environment's Foundry accounts cover. Capacity is within the environment's
  `capacityPolicy`, and the sum across every team per model is within its `quota`. Each region's
  Foundry account holds at most 32 model deployments across every team, the Azure limit per
  resource.
- `allowedDeployments` holds only the team's own deployments in Phase 1 (shared Research grants
  follow); `tokensPerMinute` does not exceed the team's capacity.
- OAuth: Entra enabled in the registry entry; CDP federations use the entry's issuer and an
  `arn:aws:iam::{account}:role/{service}` subject; Azure federations use the Defra tenant issuer and
  a principal ID; at most 20 federations and 40 clients; one team per CDP service per environment;
  secrets in a `consumer-production` environment need an exception that never names a CDP service.

## Pin file

`release` is a tag `vX.Y.Z`, or a commit SHA where the entry's `refs` allows `sha`. A tag must resolve
to `sha` in `ai-platform-infra`. `previousRelease` equals the release it replaces, so
`git log environments/{env}/platform.json` is a linear ledger. Pins are replaced, never deleted.

## Submit

The Portal API, and the release workflow for `autoPin` environments, dispatch `submit.yml` on `main`
of the state repository with `X-GitHub-Api-Version: 2026-03-10`, which returns the run ID. Inputs:

| Input               | Value                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `action`            | `write` (create or replace the file), `remove` (delete it) or `abandon`                                      |
| `environment`       | Registry entry name                                                                                          |
| `path`              | `environments/{env}/{slug}.json` or `environments/{env}/platform.json`                                       |
| `document`          | The whole canonical document for `write`; empty otherwise                                                    |
| `operation_id`      | `^[a-z0-9][a-z0-9-]{7,63}$`; also the branch name `op/{operation_id}`                                        |
| `expected_revision` | The `revision` (team) the caller last read, `0` for a new file; ignored for pins                             |
| `requested_by`      | `entra:{object ID}` of the signed-in person; replaced by `github:{user ID}` when a person dispatches the run |
| `trace_parent`      | Optional W3C `traceparent`, carried into the commit and the run report                                       |

`remove` exists for the D14 revert of a newly added team file and for deleting a team; it is a
`write` of no file.

`submit` then:

1. Is idempotent per operation: if `op/{operation_id}` already has a pull request, open or merged, it
   reports it (`existing`) and stops before validating, so a retry never fails on a `revision` that
   `main` has since moved past.
2. Validates the inputs and the document at the environment's pinned infra release, against `main`
   with the change staged locally. Nothing is written to Git if it fails (`checks-failed`).
3. Refuses a second open `op/*` pull request for the same path (`file-locked`) and a `revision` that
   does not match `main` (`revision-conflict`).
4. Commits as the App with GraphQL `createCommitOnBranch` (`expectedHeadOid`) on `op/{operation_id}`,
   opens the pull request, labels it `gitops` and `env:{env}`, and enables squash auto-merge with the
   trailers in the squash body.
5. `abandon` closes the operation's open pull request and deletes its branch, releasing the file.

Every run writes a job summary with the outcome code. Submissions for one file run one at a time, in
order (`concurrency` with `queue: max`), so a waiting submission is never replaced by a newer one.
Retries and reconciles are fresh dispatches, never re-runs.

## Commits, pull requests and checks

| Element        | Convention                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Branch         | `op/{operation_id}`                                                                                                            |
| Commit         | `chore({env}): {write\|remove} {slug or platform}` with trailers `Operation-Id`, `Requested-By` and, when given, `Traceparent` |
| Pull request   | Title as the commit; labels `gitops`, `env:{env}`; one environment per pull request                                            |
| Merge          | Squash, by auto-merge, when `validate-desired-state / validate` passes; the squash body repeats the trailers                   |
| Required check | `validate-desired-state / validate`, one stable name as a pull request changes one environment; offline, at its pin            |

## Apply

| Step             | Platform (`ai-platform-deployments`)                                                                                                                   | Tenants (`ai-platform-tenants`)                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Trigger          | Push to `main`; dispatch from `ai-platform-environments`                                                                                               | Push to `main`; dispatch from the platform apply      |
| What it applies  | A push: each environment whose folder changed since its last successful apply, so a superseded run loses nothing; a dispatch: the environment it names | Same                                                  |
| Superseded guard | Stops a run whose commit is not the head of `main` (R1)                                                                                                | Same                                                  |
| Platform first   | –                                                                                                                                                      | Runs only if the pin's platform apply succeeded (R5)  |
| Re-validation    | The pin on `main` (R4)                                                                                                                                 | Every team file on `main` (R4)                        |
| Plan and apply   | Saved plan, `plan-guard` (no deletes, R2), apply the plan                                                                                              | Saved plan, `plan-guard` (only explained deletes, R2) |
| Identity         | `id-aip-deploy-{env}` by OIDC in Environment `{env}`                                                                                                   | Same                                                  |
| Concurrency      | `platform-{env}`, never cancelled                                                                                                                      | `tenants-{env}`, never cancelled                      |
| Record           | GitHub Deployment for `{env}` at the applied SHA                                                                                                       | Same                                                  |
| Run report       | Artifact `run-report-{env}.json`, unzipped (R12)                                                                                                       | Same, with failing teams (R3)                         |
| Then             | Dispatches the tenants apply at the same release                                                                                                       | –                                                     |

Break-glass inputs, for engineers only: `allow_destroy` (R2 override, reported) and `force_unlock`
(a state lease ID, R6).

The run report ([`run-report.js`](../checks/src/run-report.js)) records the applied and previous SHAs,
every operation ID and trace context in trailers since the last applied commit, change counts per
team, failing teams, whether a failure was unattributed, and the non-sensitive Terraform outputs.

## Operation states

| Signal the Portal API reads                                                     | State                           |
| ------------------------------------------------------------------------------- | ------------------------------- |
| Submit run queued or running                                                    | `requested`                     |
| Submit run failed (nothing written)                                             | `checks-failed`                 |
| Pull request open with head `op/{operation_id}`                                 | `pr-raised`                     |
| `validate-desired-state / validate` failed, or the pull request closed unmerged | `checks-failed`, then `abandon` |
| Pull request merged at `M`                                                      | `merged`                        |
| Deployment for `{env}` at `M` or a descendant, in progress                      | `deploying`                     |
| …succeeded, and the run report lists the operation                              | `deployed`                      |
| …failed with no later success, after the D14 policy                             | `deploy-failed`                 |
| ARM reads confirm the resources in the run report's outputs                     | `verified`, then `active`       |

## Traceability

Names are never written by people, yet every resource can be traced to the request that made it:

- **Derived once.** The `naming` module is the only place a name is composed. Team children use the
  logical form design D allows where CCoE has no type code: Foundry project `aip-{slug}`, deployment
  `{slug}-{model}`, API `{slug}` at `/{slug}`.
- **Published, not recomputed.** The tenants root outputs each team's resource names and IDs; the
  run report carries them, and the Portal API stores them on the operation and verifies them by ARM.
  The Portal API never reimplements the naming pattern.
- **Tagged.** Every resource carries `aip-environment`, `aip-owner` and `aip-release`; team resources
  add `aip-team`, `aip-service-code`, `aip-operation-id` and `aip-source-sha`, the last commit that
  changed the team's file, so tags change only when that team changes.
- **Linked.** Operation ID: MongoDB operation → branch and trailer → pull request → squash commit →
  GitHub Deployment and run report → tags. `traceparent` follows the same path for design G.
- **Attributed.** `Requested-By`, `updatedBy` and `requestedBy` hold one principal: `entra:{oid}`
  for a person in the portal (the immutable Entra object ID the portal keys users on with `tid`),
  `github:{user ID}` for a person who dispatches `submit.yml` by hand (taken from the run's
  authenticated actor, never from the input) and `app:{slug}` for automation. Each resolves to one
  identity through Microsoft Graph, the GitHub API or the App registration; no name or email address
  is written to Git.

## Schema evolution

Expand and contract across two infra releases: a release that accepts the new shape, machine
migration pull requests through `submit`, then a release that refuses the old shape.
`schemaVersion` changes only for a breaking change.
