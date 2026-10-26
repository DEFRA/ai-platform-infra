# GitOps contract

The interface between the Portal API, the machine-written repositories and the apply workflows.
Schemas in [`schemas/`](../schemas) and the checks in [`checks/`](../checks) are the executable form;
this page explains them. Design source: the IaC baseline plan and designs B and C in
`ai-platform-discovery-docs`.

## Repositories and files

| Repository                        | File                                                            | Written by                   | Schema                                                                              |
| --------------------------------- | --------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `ai-platform-tenants` (internal)  | `environments/{env}/{slug}.json`                                | `submit` as the GitHub App   | [`team`](../schemas/team.schema.json)                                               |
| `ai-platform-deployments` (int.)  | `environments/{env}/platform.json`                              | `submit` as the GitHub App   | [`pin`](../schemas/pin.schema.json)                                                 |
| `ai-platform-environments` (int.) | `registry.json`                                                 | Platform engineers, reviewed | [`registry`](../schemas/registry.schema.json)                                       |
| `ai-platform-environments` (int.) | `global.tfvars.json`, `environments/{env}/platform.tfvars.json` | Platform engineers, reviewed | [`environment`](../schemas/environment.schema.json), against the deep-merged result |

Placeholder copies of each live in [`examples/`](../examples), laid out by repository. They are
schema-valid and are the test fixtures for the checks and the Portal API.

Environment parameters hold the codes every cloud shares at the top level (`environment`,
`service_code`, `naming`) and what is specific to a cloud under its key: `azure` today, read by the
Azure platform root, and `aws` beside it later, read by its own root. `aip-checks params` deep-merges
the global file with the environment's, objects key by key and arrays and values replaced, validates the
result and writes the one file Terraform reads, so an environment sets `azure.apim.sku` without
restating the rest of `azure`.

## Every machine-written file

- Whole documents only; nobody edits one in place.
- Canonical serialisation: keys sorted at every level, two-space indent, LF, one trailing newline
  ([`canonical-json.js`](../checks/src/canonical-json.js)). The Portal API and `submit` must produce
  identical bytes.
- Under 60 KB, because a dispatch input holds at most 65,535 characters.
- No secret and no personal data: inputs and files are readable by everyone who can read the
  repository. `updatedBy` and `requestedBy` name exactly one identity and never a name or email
  address (see [traceability](#traceability)).
- No resource names, except the research file's deployment names (its API's public contract). The Terraform `naming` module derives every name from CCoE's pattern and the
  environment's codes; see [traceability](#traceability).

## Team file

The fields are design C's desired-state schema, with three changes agreed on 13 October 2026:
`project.name` and `deployments[].deploymentName` are dropped because names are derived, and
`gateway.allowedDeployments` lists catalogue slugs, which the gateway maps to derived deployment
names. The one exception is the research file, below.

The Research tier is one platform-owned team file, `environments/{env}/research.json`: the same
project, account-child deployments and generated API as a team, but it names `subscription-key`, has no
`oauth` block, and carries each deployment's Azure name in `deployments[].deploymentName` and in
`allowedDeployments`, because callers send that name as the imported spec defines it and nothing
translates it. An engineer commits it (a break-glass pull request); a writer App never does, so no
portal path writes it. [`examples/`](../examples) holds a fixture.

Rules beyond the schema, enforced by `validate`:

- File name equals `team.slug`; folder equals `environment`, which must be a registry entry.
- `revision` increases on every write; `operationId` equals the operation the run was dispatched for.
- Each deployment's catalogue model has tier `team`, lists the environment, is `available` or
  `eligible` (a `deprecated` model keeps existing grants only) and offers the SKU for the `team` tier
  in a region the environment's Foundry accounts cover. The SKU and `capacity` words belong to the
  model's hosting platform, which the catalogue offering names: a Foundry deployment needs
  `capacity` and a platform that does not size by capacity takes none, so the file keeps one shape
  whatever hosts the model (18 October 2026). Capacity is within the environment's
  `capacityPolicy`, and the sum across every team per model is within its `quota`. Each region's
  Foundry account holds at most 32 model deployments across every team, the Azure limit per
  resource.
- `allowedDeployments` holds only the team's own deployments in Phase 1 (shared Research grants
  follow); `tokensPerMinute` does not exceed the team's capacity.
- Removal (design C #deletion): a team admin removes a model by submitting the file without it; the
  next apply destroys that deployment alone. A team leaves through `pending-removal`, whose
  `removeAfter` is at least the environment's cooling-off away (the registry entry's
  `removal.coolingOffDays`, else by class: 0 for `platform-test` and `sandbox`, 2 for `consumer-lower`,
  14 for `consumer-production` and `shared-service`), then `removed` once that date has passed (an
  environment with a cooling-off of zero, Infradev, may remove an active team in one step); a
  `removed` team keeps no deployments and no `oauth`, and only a `removed` team's file may be
  deleted, so the apply after the deletion has nothing of the team's to destroy. A team may return to
  `active` from either state.
- OAuth only: the team tier's `gateway.credentialType` is `oauth`, and every team that is not
  `removed` has an `oauth` block, using federated credentials, client secrets where
  `secretsAllowed`, or both, including for local development. Subscription keys belong to the Research
  tier, never to a team (direction 14 October 2026): `subscription-key` is accepted only in the
  `research` file, which has no `oauth` block, and `research` is not a team's name.
- The research file: every deployment is a catalogue model offered to the `research` tier with the
  catalogue's own `deploymentName`, a non-Global SKU (D03) and a Foundry region the environment covers;
  `allowedDeployments` and `deployments[]` list the same names; and every model the catalogue offers
  to the research tier in the environment is in it, so a key never reaches a deployment nothing built.
  Its capacity counts towards each model's quota and each account's 32 deployments with every team's.
  Only this file may carry `deploymentName`.
- OAuth: Entra enabled in the registry entry. Setting the entry's `entra.teamRegistrations` to `false`
  (default `true`) skips only each team's app registration, an interim switch for a deploy identity
  that cannot yet create app registrations: the team's project, deployments and API are still applied,
  its federations must be empty, and external clients still work. A CDP federation names only its CDP service; Terraform
  derives the issuer, the subject `arn:aws:iam::{account}:role/{service}` and the audience from the
  environment's registry entry, so a team file holds nothing environment-specific for CDP. Azure
  federations use the Defra tenant issuer and a principal ID; at most 20 federations and 40 clients;
  no two federations of a team trust one workload; one team per CDP service per environment;
  secrets in a `consumer-production` environment need an exception that never names a CDP service.
- Entra objects: the environment's deploy identity creates the platform's API audience registration
  and service principal, and the same pair for each team. Entra counts every object it creates,
  soft-deleted ones included, so the teams of an environment stay within the registry entry's
  `entra.createdObjectLimit` (250 by default); each tenants apply permanently deletes the
  registrations it removed.

## Pin file

`release` is a tag `vX.Y.Z`, or a commit SHA where the entry's `refs` allows `sha`. A tag must resolve
to `sha` in `ai-platform-infra`. `previousRelease` equals the release it replaces, so
`git log environments/{env}/platform.json` is a linear ledger. Pins are replaced, never deleted.

## Submit

Workflows `v2`. The GitOps worker, which the Portal API commands through a queue, and the release workflow
for `autoPin` environments, dispatch `submit.yml` on `main` of the state repository with
`X-GitHub-Api-Version: 2026-03-10`, which returns the run ID. Inputs:

| Input               | Value                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `action`            | `write` (create or replace the file), `remove` (delete it) or `revert` (undo an earlier operation; a write recorded as its own operation)                                            |
| `environment`       | Registry entry name                                                                                                                                                                  |
| `path`              | `environments/{env}/{slug}.json` or `environments/{env}/platform.json`                                                                                                               |
| `document`          | The whole canonical document for `write`; empty otherwise                                                                                                                            |
| `operation_id`      | Optional, `^[a-z0-9][a-z0-9-]{7,63}$`. The run name carries it as `({operation_id})`, which is how the worker finds the run. A run started by hand generates its own and refuses one |
| `expected_revision` | The team file's `revision` the caller last read, `0` for a new file; team files only                                                                                                 |
| `expected_base`     | The pin file's blob SHA on `main` the caller last read; pins only. Every write, an admin's too, names its base                                                                       |
| `requested_by`      | `entra:{object ID}` of the signed-in person; replaced by `github:{user ID}` when a person dispatches the run                                                                         |
| `trace_parent`      | Optional W3C `traceparent`, carried into the commit and the events                                                                                                                   |
| `cdp_request_id`    | Optional CDP request ID, carried into the events                                                                                                                                     |

`remove` exists for the D14 revert of a newly added team file and for deleting a team; it is a
`write` of no file.

`submit` runs in the `{env}-events` Environment and commits directly to `main` as the App: no branch, no
pull request. It then:

1. Checks the base. A `revision` or blob SHA that no longer matches `main` ends `stale-revision`, and an
   exempt App's write while the environment is paused ends `paused`. Both are retryable and commit nothing.
2. Validates the inputs and the whole document at the environment's pinned infra release, against `main`
   with the change staged locally. Nothing is written to Git if it fails (`checks-failed`).
3. Commits as the App with GraphQL `createCommitOnBranch` (`expectedHeadOid`) and the trailers
   `Operation-Id`, `Requested-By` and `Traceparent`. If `main` has moved, it stages and validates again, up
   to three times with 1 to 3 seconds of jitter, then ends `commit-conflict` and sends no terminal event;
   the worker's reconciler dispatches again.
4. Publishes the events `requested`, `committed` or `checks-failed` ([messages](#messages)).

Every run writes a job summary with the outcome code. Submissions for one file run one at a time, in
order (`concurrency` with `queue: max`), so a waiting submission is never replaced by a newer one.
Retries and reconciles are fresh dispatches, never re-runs. `v2` removes `abandon`, the pull request, the
auto-merge and `prune-op-branches.yml`.

## Commits and checks

| Element        | Convention                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Branch         | `main`: the App commits directly, bypassing only the pull request rule (`aip-machine-main`)                                            |
| Commit         | `chore({env}): {write\|remove\|revert} {slug or platform}` with trailers `Operation-Id`, `Requested-By` and, when given, `Traceparent` |
| Pull request   | None for a portal change                                                                                                               |
| Required check | `submit` validates before it commits, offline, at the environment's pin                                                                |

## Apply

| Step             | Platform (`ai-platform-deployments`)                                                                                                                                          | Tenants (`ai-platform-tenants`)                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger          | Push to `main`; dispatch from `ai-platform-environments`                                                                                                                      | Push to `main`; dispatch from the platform apply                                                                                                  |
| What it applies  | A push: each environment whose folder changed since its last successful apply, so a superseded run loses nothing; a dispatch: the environment it names                        | Same                                                                                                                                              |
| Superseded guard | Stops a run whose commit is not the head of `main` (R1)                                                                                                                       | Same                                                                                                                                              |
| Platform first   | –                                                                                                                                                                             | Runs only if the pin's platform apply succeeded (R5)                                                                                              |
| Re-validation    | The pin on `main` (R4)                                                                                                                                                        | Every team file on `main` (R4)                                                                                                                    |
| Plan and apply   | Saved plan, `plan-guard` (no deletes, R2), apply the plan                                                                                                                     | Saved plan, `plan-guard` (only deletes a removed team, model, its API operations or federation explains, spanning at most one team per apply, R2) |
| Identity         | `id-aip-deploy-{env}` by OIDC in Environment `{env}`                                                                                                                          | Same                                                                                                                                              |
| Concurrency      | `platform-{env}`, never cancelled                                                                                                                                             | `tenants-{env}`, never cancelled                                                                                                                  |
| Record           | GitHub Deployment for `{env}` at the applied SHA                                                                                                                              | Same                                                                                                                                              |
| Run report       | Artifact `run-report-{env}.json`, unzipped (R12)                                                                                                                              | Same, with failing teams (R3)                                                                                                                     |
| Events           | `deploying` after the preflight, then `deployed` or `deploy-failed` for each operation in the report, as `id-aip-events-{env}`; none for a superseded, empty or cancelled run | Same                                                                                                                                              |
| Then             | Dispatches the tenants apply at the same release                                                                                                                              | Permanently deletes the Entra registrations the apply removed, so they stop counting towards the deploy identity's limit                          |

Break-glass inputs, for engineers only: `allow_destroy` (R2 override, reported; also what lets one
apply remove more than one team, so a mistaken sweep never runs unattended) and `force_unlock`
(a state lease ID, R6).

The run report ([`run-report.js`](../checks/src/run-report.js)) records the applied and previous SHAs,
every operation ID and trace context in trailers since the last applied commit, change counts per
team, failing teams, whether a failure was unattributed, the number of Entra objects the state holds
(monitored against the deploy identity's limit), and the non-sensitive Terraform outputs.

## Operation states

The backend owns an operation's state and moves it forward only, from the events below and its own reads:

| Signal the backend reads                                           | State                                               |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| Another operation holds the file                                   | `queued`                                            |
| Accepted while the file is free; the command is on its way         | `requested`                                         |
| `committed` event                                                  | `committed`                                         |
| `deploying` event                                                  | `deploying`                                         |
| `deployed` event                                                   | `deployed`                                          |
| `checks-failed` or `deploy-failed` event, corroborated with GitHub | `checks-failed`, `deploy-failed`                    |
| ARM reads confirm the resources the event names                    | `verified`, then `active` (`removed` for a removal) |
| A stage passes its deadline                                        | `timed-out`                                         |

A D14 revert is itself an operation the backend follows to its end. If a revert ends `checks-failed` or
`deploy-failed`, the backend flags the original operation, audits it and alerts an engineer, and never
retries it (direction 14 October 2026).

## Messages

The backend and the workflows do not call each other. The backend sends **commands** to the GitOps worker
and receives **events** from the workflows and the worker, through two SQS FIFO queues (design C
#architecture; plan: `ai-platform-discovery-docs` `docs/async-operations-plan.md` §5). The JSON Schemas
are the contract, JSON Schema 2020-12 with `additionalProperties: false`:

| Message | Schema                                                           | Producer                                             | Consumer | SQS group                                                                       | SQS deduplication ID |
| ------- | ---------------------------------------------------------------- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------- | -------------------- |
| Command | [`command.schema.json`](../schemas/messages/command.schema.json) | the backend                                          | worker   | `{environment}/{team}`                                                          | `commandId`          |
| Event   | [`event.schema.json`](../schemas/messages/event.schema.json)     | `id-aip-events-{env}` (the workflows) and the worker | backend  | the operation ID; the commit SHA for `break-glass`; `{environment}` for `pause` | `eventId`            |

- **Identifiers.** `aip.gitops.command/1` and `aip.gitops.event/1`, in the `schema` field. Changes are
  additive; a breaking change is a new identifier and a new queue contract, never an edit. Date-times use
  the `date-time` format, so the validator needs `ajv-formats` or its equivalent.
- **Examples.** [`schemas/messages/examples/`](../schemas/messages/examples) holds one command per `type`
  and one event per `status`, plus `break-glass`, a run with no operation and each retryable failure. The
  self-tests in `checks/` prove each is valid, that each rule rejects what it should, and that the examples
  cover every status.
- **Vendoring.** The backend and the worker copy both files byte for byte with
  `npm run contracts:sync -- {ref}` (a release tag, or a commit SHA during a build) and
  `npm run contracts:check` fails any difference.
- **Commands.** `type` is `submit`, `apply` or `reconcile`. `commandId` is a UUIDv7 made with the operation's
  outbox entry and kept when it is republished, so a new send is delivered and only a republish collapses.
  A submit, and a reconcile from `requested`, carry `action` and, for a `write` or a `revert`, the whole
  `document`; and `expectedRevision` for a team file, or `expectedBase` for a pin (team `platform` or
  `tenants`), which is null for an environment's first pin. The worker passes them as the `submit` inputs
  above. The target is whole: `operationId`, `team` and `path` are all present or, for an `apply` that is for
  no operation, all null.
- **Events.** `status` is `requested`, `checks-failed`, `committed`, `deploying`, `deployed`, `deploy-failed`,
  `paused` or `resumed`; `source` is `submit`, `apply`, `pause` or `reconciler`. `eventId` is
  `{operationId or commitSha or environment}:{status}:{runId}:{runAttempt}`, so a repeat collapses.
  `operationId` is null for `break-glass`, `pause` and a run with no operation; `team` and `path` are null
  for `pause`, and travel together otherwise: both, or neither.
  `failureReason {code, message, retryable}` comes with `checks-failed` and `deploy-failed`; `retryable` is
  true exactly for `stale-revision`, `paused` and `commit-conflict` on `checks-failed`, and `paused` on
  `deploy-failed`. `deployed` carries `appliedSha` and `resources[]`; `deploy-failed` carries `failingTeams[]`
  and `attributable`.
- **People.** `requestedBy` is `entra:{oid}`, `github:{user ID}` or `app:{name}`, never a name or an email address.

The events identity that publishes them is created by the [bootstrap](bootstrap.md#the-events-identity).

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
- **Linked.** Operation ID: backend operation → `Operation-Id` trailer on the commit → event → GitHub
  Deployment and run report → tags. `traceparent` and `cdp_request_id` follow the same path for design G.
- **Attributed.** `Requested-By`, `updatedBy` and `requestedBy` hold one principal: `entra:{oid}`
  for a person in the portal (the immutable Entra object ID the portal keys users on with `tid`),
  `github:{user ID}` for a person who dispatches `submit.yml` by hand (taken from the run's
  authenticated actor, never from the input) and `app:{slug}` for automation. Each resolves to one
  identity through Microsoft Graph, the GitHub API or the App registration; no name or email address
  is written to Git.

## Schema evolution

Expand and contract across two infra releases: a release that accepts the new shape, machine
migration commits through `submit`, then a release that refuses the old shape.
`schemaVersion` changes only for a breaking change. The message schemas change by addition only; the
identifier's number (`/1`) changes for a breaking change, with the backend and the worker moved together.
