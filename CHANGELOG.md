# Changelog

## [0.9.0](https://github.com/DEFRA/ai-platform-infra/compare/v0.8.0...v0.9.0) (2026-10-20)


### Features

* research tier as a platform-owned team file with subscription keys ([#18](https://github.com/DEFRA/ai-platform-infra/issues/18)) ([812b106](https://github.com/DEFRA/ai-platform-infra/commit/812b10664c4eb1705e3833ef5cdf83f458e44e28))

## [0.8.0](https://github.com/DEFRA/ai-platform-infra/compare/v0.7.0...v0.8.0) (2026-10-19)


### Features

* global gateway guard with named backends, hosting-neutral deployments, removal lifecycle, destroy cap and locks ([#16](https://github.com/DEFRA/ai-platform-infra/issues/16)) ([666bffb](https://github.com/DEFRA/ai-platform-infra/commit/666bffb8531882148be8ae1416d48e85d7dc34b7))

## [0.7.0](https://github.com/DEFRA/ai-platform-infra/compare/v0.6.0...v0.7.0) (2026-10-15)


### Features

* add a UK South team SKU to gpt-4o ([#14](https://github.com/DEFRA/ai-platform-infra/issues/14)) ([f232592](https://github.com/DEFRA/ai-platform-infra/commit/f232592707be6f5c3e99f120c05444312f9b4f9a))

## [0.6.0](https://github.com/DEFRA/ai-platform-infra/compare/v0.5.0...v0.6.0) (2026-10-15)


### Features

* add entra.teamRegistrations to skip team app registrations ([#12](https://github.com/DEFRA/ai-platform-infra/issues/12)) ([4e9a574](https://github.com/DEFRA/ai-platform-infra/commit/4e9a574ccfd3aef0e3d6ee0385b966f9097aaa26))

## [0.5.0](https://github.com/DEFRA/ai-platform-infra/compare/v0.4.0...v0.5.0) (2026-10-15)


### Features

* add the team modules and the tenants root ([b72dd68](https://github.com/DEFRA/ai-platform-infra/commit/b72dd68419458cb71b8fbebe2b5b338087c4dab4))
* add the team modules and the tenants root ([0592d41](https://github.com/DEFRA/ai-platform-infra/commit/0592d41f4fedefc31cec3f6e33abc27425c8cfd4))
* derive CDP federations from the registry entry in Terraform ([ac79197](https://github.com/DEFRA/ai-platform-infra/commit/ac7919739cdc9db455ed42560f691d37fb574c50))
* give every team an OAuth registration and a token-only API ([7aa08e8](https://github.com/DEFRA/ai-platform-infra/commit/7aa08e81c4b75d433b3b7aae3577b38f7aa760d7))


### Bug Fixes

* ignore the ServiceCode tag Azure Policy adds to Foundry projects ([d755b1b](https://github.com/DEFRA/ai-platform-infra/commit/d755b1bb390e32feb1a98f112b0f7b3b4202512d))

## [0.4.0](https://github.com/DEFRA/ai-platform-infra/compare/v0.3.0...v0.4.0) (2026-10-15)


### Features

* add the naming module, the platform root and the bootstrap ([#6](https://github.com/DEFRA/ai-platform-infra/issues/6)) ([a8d326e](https://github.com/DEFRA/ai-platform-infra/commit/a8d326e0e94fc6e7b2a2ef0e6a056238001ac939))

## [0.3.0](https://github.com/DEFRA/ai-platform-infra/compare/v0.2.0...v0.3.0) (2026-10-15)


### Features

* add the GitOps contract, schemas, checks and team tier ([211f390](https://github.com/DEFRA/ai-platform-infra/commit/211f3909b91f0249067b3239d28f2a00c5b1050c))
* add the GitOps contract, schemas, checks and team tier ([7d2b4ab](https://github.com/DEFRA/ai-platform-infra/commit/7d2b4ab2917daee6ba3ecb6ef9fc206763ffcb56))
* adopt hosting and gateway offering shape, add catalogue schema ([e0068e4](https://github.com/DEFRA/ai-platform-infra/commit/e0068e448b0133e416a0d94de9f052bae349f658))
* allow an existing resource group before the gate before DEV ([4389135](https://github.com/DEFRA/ai-platform-infra/commit/43891358fb777e839028e987225c74dfba4ee3cf))
* attribute every GitOps change to exactly one principal ([3fc88df](https://github.com/DEFRA/ai-platform-infra/commit/3fc88df0c44975c0c9e596ac718e98b295091916))
* name only the CDP service in a federation and guard the Entra object limit ([abdf256](https://github.com/DEFRA/ai-platform-infra/commit/abdf256bf3e42255817231753595d5a2c6b4d5d5))
* OAuth-only team tier, cloud-namespaced parameters and the team file lifecycle ([e8400b5](https://github.com/DEFRA/ai-platform-infra/commit/e8400b5bd78f92e473c5ee7846e600e3d9a01b36))


### Bug Fixes

* address the review of the GitOps contract checks ([c4c6427](https://github.com/DEFRA/ai-platform-infra/commit/c4c64273f8662b533ff33d9f01319bff5ef27fbf))
* pass secrets to the reusable workflows that mint an App token ([e08bafb](https://github.com/DEFRA/ai-platform-infra/commit/e08bafbe8434cfb412f508e34fafbff28cf3d970))
* refuse more than 32 model deployments in one Foundry account ([1371a7f](https://github.com/DEFRA/ai-platform-infra/commit/1371a7f2a32a82ace99e95fa8e290a0ec21ad31e))
