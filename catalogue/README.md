# Catalogue

`providers/{id}.json` is a model maker (OpenAI, Anthropic, Meta) and lists its `offerings[]`: one
per hosting route. `models/{slug}.json` names its `provider` and `offering`. Both are validated by
`schema/`; the backend does not sync `schema/`.

Every model is exposed through Azure API Management, whatever hosts it. An offering's `hosting`
(`foundry`, `bedrock` or `direct`) says where the model runs; its `gateway` (only `azure-apim`
today) says how credentials are issued. A hosting platform is never a gateway. Model files do not
repeat `cloud` or `adapter`; the backend derives them from the offering.

No `bedrock` offering ships yet. The schema permits one, but how API Management authenticates to
Amazon Bedrock without long-lived AWS keys is unresolved (design pack constraint 10).

Release `v0.2.0` adopts this shape. The backend reads it and the earlier flat shape
(`cloud`/`adapter` on each offering), so move each environment's `CATALOGUE_REF` only after a
backend that reads both is deployed there.
