# Bootstrap

One-time per subscription, before any workflow can apply: the state account and container, the deploy
identity's federated credentials and its missing roles, and the events identity the workflows publish
status events as. Run by a platform engineer with Owner, or
Contributor and User Access Administrator, signed in with the Azure CLI. After this the deploy identity
owns every change.

Where the subscription's resource groups are made for the team (SND1 before the gate before DEV), set
`existing_resource_group` under `azure` in the environment's parameters: the platform and its state then go into that
group, and you need Contributor and User Access Administrator (or Role Based Access Control
Administrator) on the group rather than the subscription. The bootstrap gives the deploy identity Contributor at that
group, or at the subscription when `existing_resource_group` is unset; set `grant_contributor` to `false` where it
already holds Contributor there.

## Before you start

1. The state repositories are internal (D8). Do not apply before they are: apply logs show resource IDs.
2. Defra Policy in the subscription allows the names, public network access for the Phase 1 platform,
   API Management Developer and UK South. The DEFRA management group policy Allowed locations refused Sweden Central
   in `AZR-AIE-SND1` (15 October 2026), so that environment's `azure.foundry.regions` is UK South only.
3. You know the client ID of the existing app registration that is `id-aip-deploy-{env}` (D5); it is not
   committed anywhere public.
4. Decide `grant_graph_application_owned_by`: it needs an Entra role that can grant application
   permissions. Without it, OAuth teams (M4) cannot be created, and a tenants apply cannot permanently
   delete the registrations it removes, which then count towards the deploy identity's Entra limit for
   30 days.
5. The platform apply creates a custom role definition and assigns it (`modules/apim-subscription-role`, for
   the Portal API's research subscriptions). The constrained Role Based Access Control Administrator grant
   cannot write a role definition or assign a role outside its delegable list, so the deploy identity needs
   User Access Administrator (or Owner) on the platform's scope as well. Infradev's holds it on the whole
   subscription (confirmed 20 October 2026); in any other environment set `grant_user_access_administrator`
   to `true` (default `false`, so a holder is left alone) before its first platform apply.
6. The events identity's token audience is the deploy identity's own app registration, so no Entra right to
   create an application is needed. Make it issue v1 access tokens (Terraform cannot write the setting, and
   the `events_identity` output refuses to plan while it is 2). A v2 token carries `azp`, the events
   identity's client ID, which AWS STS takes as the audience in place of `aud`, so CDP's role would refuse it;
   a v1 token has no `azp`. As an owner of that registration:

   ```sh
   oid=$(az ad app show --id <deploy client ID> --query id -o tsv)
   az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$oid" \
     --headers "Content-Type=application/json" --body '{"api":{"requestedAccessTokenVersion":1}}'
   ```

   This changes the tokens issued **for** that registration as a resource, not the tokens it obtains to deploy.

## Run

From an `ai-platform-infra` checkout, with `ai-platform-environments` beside it:

```sh
az login --tenant <tenant-id>
az account set --subscription <subscription-id>
export ARM_SUBSCRIPTION_ID=<subscription-id>

# The environment's parameters, merged and validated, as the workflows read them.
npm ci --prefix checks
node checks/bin/aip-checks.js params --infra . --environments ../ai-platform-environments \
  --environment infradev --out /tmp/params.tfvars.json

prefix() { gh api "repos/DEFRA/$1/actions/oidc/customization/sub" --jq .sub_claim_prefix; }
cat > bootstrap/bootstrap.auto.tfvars.json <<EOF
{
  "params_file": "/tmp/params.tfvars.json",
  "deploy_client_id": "<deploy identity client ID>",
  "oidc_subject_prefixes": {
    "ai-platform-tenants": "$(prefix ai-platform-tenants)",
    "ai-platform-deployments": "$(prefix ai-platform-deployments)"
  },
  "grant_graph_application_owned_by": true
}
EOF

terraform -chdir=bootstrap init
terraform -chdir=bootstrap apply
```

`params_file` is the file the workflows read too: `aip-checks params` deep-merges the shared parameters
with the environment's and validates them. The DEFRA repositories use immutable OIDC subjects,
`repo:DEFRA@{org-id}/{repo}@{repo-id}`, so the federated credentials are created from each repository's
prefix rather than its name. Keep `bootstrap/bootstrap.auto.tfvars.json` out of Git (it is ignored); it
holds a real client ID.

## Move the bootstrap state into the account

1. Uncomment the backend block in `bootstrap/backend.tf`.
2. Migrate, with the names from `terraform -chdir=bootstrap output backend`:

   ```sh
   terraform -chdir=bootstrap init -migrate-state \
     -backend-config=resource_group_name=<rg> -backend-config=storage_account_name=<account> \
     -backend-config=container_name=tfstate -backend-config=key=bootstrap.tfstate
   ```

3. Revoke the operator's standing access to state in two applies, because the role assignment sits under
   the locked account and Azure refuses to delete a role assignment under a lock: first
   `-var operator_state_access=false -var lock_state_account=false`, which removes the lock and then the
   assignment, then `-var operator_state_access=false` alone, which relocks the account.
4. Do not commit the uncommented `backend.tf` until the bootstrap of every environment uses the backend.

## Then

Set the GitHub variables in both state repositories: `AZURE_TENANT_ID` and `GITOPS_APP_CLIENT_ID` once
as repository variables, `AZURE_CLIENT_ID` and `AZURE_SUBSCRIPTION_ID` on the `{env}` Environment. Merge
the environment's registry entry and parameters in `ai-platform-environments`. The next infra release
pins and applies the platform. Then set the events variables below.

## The events identity

The apply creates `id-aip-events-{env}`, a user-assigned managed identity with **no Azure role**, in the state
resource group, and adds the identifier URI `api://{deploy client ID}` to the deploy identity's app registration,
which is the token audience. The workflows (`submit`, the apply and `pause.yml`) sign in as the identity and
present a token for that registration, which CDP's IAM role trusts, only for this identity as subject, to send
to the events queue and do nothing else (design C #identities). The audience registration is the deploy
identity's, not a separate no-permission one: the role's subject restriction, not the audience, keeps the
deploy identity itself out.

The identity trusts four subjects, and the `oidc_subject_prefixes` validation refuses any other repository:

| Repository                | Environment    | Used by                                                         |
| ------------------------- | -------------- | --------------------------------------------------------------- |
| `ai-platform-tenants`     | `{env}`        | the apply                                                       |
| `ai-platform-tenants`     | `{env}-events` | `submit` and `pause.yml`, which create no Deployment in `{env}` |
| `ai-platform-deployments` | `{env}`        | the apply                                                       |
| `ai-platform-deployments` | `{env}-events` | `submit` and `pause.yml`                                        |

Azure can refuse several credentials written to one managed identity at once. If the first apply reports a
conflict on a credential, run it again; the rest of the apply is unchanged, or use `-parallelism=1`.

Read the values with `terraform -chdir=bootstrap output events_identity`:

1. In both Environments (`{env}` and `{env}-events`) of both state repositories set `AIP_EVENTS_CLIENT_ID`
   to `client_id` and `AIP_EVENTS_AUDIENCE` to `audience`: the deploy registration's client ID, which the
   workflows request the token for and so is its `aud` (`audience_uri`, its `api://` identifier URI, would make
   `aud` the URI). `AIP_EVENTS_QUEUE_URL` and `AIP_EVENTS_ROLE_ARN` come from CDP (step 2); `AIP_PAUSED` goes
   on `{env}-events` only. `AZURE_TENANT_ID` is the repository variable set above.
2. Ask CDP support for external access to the events queue for this identity, as `sqs:SendMessage` only, in
   their "Managed Identities against an App Reg" form: `issuer_url` is `issuer`
   (`https://sts.windows.net/{tenant}/`, with the trailing slash, as the v1 token's `iss` is), `client_id` is
   `audience` and `subject_id` is `principal_id`. Never send a secret: there is none.
3. Do not grant the identity an Azure role. A test fails the build if a role assignment in the bootstrap
   names it.

The output holds identifiers, not secrets, but they are environment values: keep them out of this public repository.

## Lock the core resources

Only Owner or User Access Administrator may write a management lock, which the deploy identity is not, so
the bootstrap holds them. The state account is locked from the first apply (`lock_state_account`); the role
assignments on its container inherit the lock, so changing one, including revoking the operator's access,
means lifting the lock for that apply and relocking on the next. Once the first platform apply
has created the vaults and the workspace, apply the bootstrap again with `-var lock_platform_resources=true`:
`CanNotDelete` on both Key Vaults and the Log Analytics workspace, which their role assignments and
diagnostic settings inherit. API Management and the Foundry accounts take no lock, because every team API,
project and deployment under them would inherit it and the tenants apply removes those by design;
`prevent_destroy` and `plan-guard` cover them. To remove a locked resource deliberately, remove its lock
here first (`-var lock_platform_resources=false`), then dispatch the apply with `allow_destroy`.
