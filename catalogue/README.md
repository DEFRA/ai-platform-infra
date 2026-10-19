# Catalogue

`providers/{id}.json` is a model maker (OpenAI, Anthropic, Meta) and lists its `offerings[]`: one
per hosting route. `models/{slug}.json` names its `provider` and `offering`. Both are validated by
`schema/`; the backend does not sync `schema/`.

Every model is exposed through Azure API Management, whatever hosts it. An offering's `hosting`
(`foundry`, `bedrock` or `direct`) says where the model runs; its `gateway` (only `azure-apim`
today) says how credentials are issued. A hosting platform is never a gateway. Model files do not
repeat `cloud` or `adapter`; the backend derives them from the offering, and so does Terraform: the
tenants root gives each model its offering's `hosting`, the `team` module deploys it with that
platform's module and routes its API to that platform's named backend and fragment, and the checks
decide from it whether a deployment entry needs `capacity`. A team file never names a cloud.

No `bedrock` offering ships yet. The schema permits one, but how API Management authenticates to
Amazon Bedrock without long-lived AWS keys is unresolved (design pack constraint 10): Microsoft's own
walkthrough signs SigV4 in policy from keys held as named values. Adding it is a platform release
(a deployment module, a backend per region, an `aip-backend-bedrock` fragment, and a `capacity`
rule for on-demand against provisioned throughput), not a change to any team file.

Release `v0.2.0` adopts this shape. Backends before it read only the earlier flat shape, so move an
environment's `CATALOGUE_REF` to `v0.2.0` only once the new backend is deployed there.

A model's `tiers` say who may use it. A `skus[]` entry without `tiers` is the hand-built Research
deployment; the `team` tier needs a SKU with `tiers: ["team"]`, its `regions` and `dataZone`, and never a
Global type (D03). `gpt-4-1-nano` and `gpt-5-nano` offer `DataZoneStandard` in Sweden Central to teams in
Infradev, because neither is offered as Standard in UK South. `capacityPolicy.environments.{env}` overrides
the limits per environment; its `quota`, in thousands of tokens per minute, caps the sum across every team
in that environment, and an environment without one grants no team capacity.
