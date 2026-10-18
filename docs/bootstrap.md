# Bootstrap

One-time per subscription, before any workflow can apply: the state account and container, the deploy
identity's federated credentials and its missing roles. Run by a platform engineer with Owner, or
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

3. Apply once more with `-var operator_state_access=false`, so no person keeps standing access to state.
4. Do not commit the uncommented `backend.tf` until the bootstrap of every environment uses the backend.

## Then

Set the GitHub variables in both state repositories: `AZURE_TENANT_ID` and `GITOPS_APP_CLIENT_ID` once
as repository variables, `AZURE_CLIENT_ID` and `AZURE_SUBSCRIPTION_ID` on the `{env}` Environment. Merge
the environment's registry entry and parameters in `ai-platform-environments`. The next infra release
pins and applies the platform.

## Lock the core resources

Only Owner or User Access Administrator may write a management lock, which the deploy identity is not, so
the bootstrap holds them. The state account is locked from the first apply. Once the first platform apply
has created the vaults and the workspace, apply the bootstrap again with `-var lock_platform_resources=true`:
`CanNotDelete` on both Key Vaults and the Log Analytics workspace, which their role assignments and
diagnostic settings inherit. API Management and the Foundry accounts take no lock, because every team API,
project and deployment under them would inherit it and the tenants apply removes those by design;
`prevent_destroy` and `plan-guard` cover them. To remove a locked resource deliberately, remove its lock
here first (`-var lock_platform_resources=false`), then dispatch the apply with `allow_destroy`.
