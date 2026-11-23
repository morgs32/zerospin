# Addressed async continuations with concrete Effect contracts

Status: Completed and verified on 2026-10-12. Approved after PR #49's design conflicted with the Effect contract cutover. PR #49 is closed. The user selected local `main`, after PR #50's work completed, as both the implementation base and destination. Baseline: `8ea2f246c5`.

## Scope and decisions

1. Rebuild source-owned cross-owner async continuations using the current checked Effect programs and concrete aggregate/service operation codecs. Preserve the forward-only Repo lifecycle from PR #50. Do not restore Channels, mapper factories, separately authored receiving bindings, compatibility decoders, or translation migrations.
2. Every aggregate async operation carries its receiving aggregate name/version and explicit instance ID; every service async operation carries its receiving service name/version. Generated codecs capture only the canonical external declaration. These dynamic operation addresses replace the same-owner restriction of [Plan 140](140-plan-effect-contract-evaluation-and-async-receivers.md), without changing its contract evaluation or model permission design.
3. Server implementations and server-only external continuations may emit either concrete receiving family. Ordinary public declarations remain model-only. Validate exact captured external declarations in the System graph and exact emitted receiving addresses before applying output. Claim-bearing continuations remain restricted to their original owner/instance and compatible actor claims. Cross-owner or cross-instance continuations require a claims-free declaration and receiving system authority.
4. The emitting VersionRepo owns production, stable child IDs, recorded observations and the delivery outbox. Retain receiving address separately from source provenance. Recording a response and child enqueue remains one synchronous transaction. Recorded reconstruction and complete-child source proof require retained production evidence, without the initiating command or current external declaration. Replay creates no production or delivery authority.
5. Receiving Chains resolve source VersionRepos within their bound System, verify the complete delivered child, then atomically admit/deduplicate it. Group each source outbox page by receiving address and acknowledge it only after every group is retained. A partial retry retains stable IDs and cannot duplicate admission.
6. Shopping checkout freezes the quote/cart as before and emits a user-owned `asyncCreatePurchase` continuation addressed from verified shopper claims. That external continuation owns quote idempotency/conflicts and emits payment only when a purchase is newly created. Remove the custom purchase bridge and obsolete bridge-only ordinary purchase declarations. Migrate all other existing async callers to required addresses.
7. Put the verified work on local `main`; do not open a replacement PR or publish local `main`. No new test files, fixtures, check runners, configuration or cast exemptions are authorized. Update existing acceptance checks where their old same-owner assertions are superseded. Shopping browser verification remains prohibited.
8. Changed pre-release storage and transported schemas require empty affected storage. Preserve the migration lifecycle and existing migration history; do not translate deprecated rows or retrofit compatibility.

## Implementation

1. Extend concrete operation types, generated codecs, makers, external program operation types, and declaration/System validation. Preserve public/session concrete family provenance and independent read/mutation scopes.
2. Add retained concrete receiving addresses and source-proof delivery envelopes. Update source producer resolution, immutable output, child reconstruction, outbox grouping, and both recorded admission paths without moving their transaction owners.
3. Replace Shopping's custom bridge with its addressed user continuation; preserve quote conflicts, empty-cart behavior and created-only payment. Update fulfillment and TicTacToe addresses.
4. Reconcile module READMEs, existing architecture workflows, glossary and local operation patterns. Record the implemented authority/routing trade-off in an ADR extending [ADR 008](../../adrs/008-ordinary-and-recorded-continuation-authority.md).
5. Run one scoped Nx build/type/lint graph with dependencies, existing declaration inference and SQLite/runtime acceptance checks, the existing Workerd suite, changed-file formatting and whitespace checks. Independently review complete-child proof, cross-owner claims isolation, partial-page retries, idempotency and replay.
6. Record the outcome and verification evidence, archive this plan when no work remains, and commit the completed changes on local `main`.

Legend: `+` create, `~` modify, `-` remove. Root is `zerospin/`.

```text
zerospin/
  packages/core/src/contracts/                       ~ concrete receiving fields and backend async permission
  packages/core/src/declaration/                     ~ local claims and canonical receiver validation
  packages/core/src/system/make/makeSystem/           ~ global concrete receiver registration
  packages/core/verification/plan140.ts               ~ existing inference acceptance checks
  packages/system-worker/src/asyncOperations/         ~ retained receiving addresses, production, proof, delivery
  packages/system-worker/src/{Aggregate,Service}VersionRepo/ ~ source-owned production and outbox
  packages/system-worker/src/{Aggregate,Service}Chain/ ~ source-proved recorded admission
  packages/system-worker/src/repoServices/            ~ addressed delivery RPC contracts
  examples/shopping/src/zerospin/aggregates/user/contracts/asyncCreatePurchaseV1.ts + user continuation
  examples/shopping/src/zerospin/aggregates/user/contracts/createPurchase{,Server}V1.ts - obsolete bridge path
  examples/shopping/src/zerospin/services/marketplace/contracts/checkout/ ~ addressed checkout
  examples/shopping/src/zerospin/ShoppingPurchaseDelivery{,Live}.ts - custom bridge
  examples/shopping/zerospin.config.ts                ~ application layers
  examples/tic-tac-toe/src/contracts/playXServerV1.ts  ~ explicit receiving address
  scripts/verify-plan140.mjs                          ~ existing runtime acceptance seams
  wiki/architecture/                                 ~ affected ownership workflows
  wiki/patterns/contracts/                           ~ concrete addressed authoring
  wiki/glossary.md                                   ~ implemented domain terms
  wiki/adrs/010-source-owned-addressed-async-continuations.md + implemented authority decision
  wiki/plans/142-plan-addressed-async-continuations.md + this plan
```

## Outcome and verification

1. Implemented required concrete receiving addresses, System-wide canonical receiving declaration validation, backend external async permission, retained source provenance and frozen System name, complete-child source proof, grouped delivery and atomic recorded admission. Preserved checked Effect evaluation, local model permissions, historical same-owner actor authority, original-only production and the migration lifecycle. Removed unused delivery capability wrappers.
2. Shopping checkout now emits its addressed user-owned purchase continuation. Quote idempotency/conflicts remain; payment emits only for a newly created purchase. Removed the custom bridge and obsolete ordinary purchase declarations. Updated fulfillment and TicTacToe callers, schema capture, module READMEs, affected architecture workflows, glossary and local operation guidance. [ADR 010](../../adrs/010-source-owned-addressed-async-continuations.md) records the implemented authority boundary.
3. The scoped library/type/lint and existing Workerd graph ran for Core, SDK, browser, System-Worker, Studio, Shopping, TicTacToe, Explorer and CLI with dependencies. Builds, typechecks, consumer lint and both Workerd files/all five tests passed. After resolving worker lint spacing/unused-variable warnings, the final worker library/type/lint graph passed all seven tasks. Explorer's six existing warnings in unchanged UI files remain. Logs: `/tmp/zerospin-rebuilt-async-nx.log`, `/tmp/zerospin-rebuilt-async-worker-final.log`. Nx Cloud access code 401 did not prevent local verification.
4. The existing declaration-inference acceptance file passed its strict compile command from Plan 140 after required address fields and external continuation permission were updated. No new test files, fixtures, runners or configuration were created.
5. The existing runtime acceptance script passed seven groups against production contract interfaces and actual in-memory SQLite. Addressed work verifies aggregate/service crossing, remote claims refusal, frozen System name, complete-child tamper refusal, partial-page retry/deduplication, retained recovery after declaration removal, no initiating command requirement, portable Date producer input and replay without production. The real Shopping declaration verifies quote conflicts, idempotency and created-only payment. Existing evaluation, resource-scope, rollback, result encoding and standalone checks remain. Log: `/tmp/zerospin-rebuilt-async-runtime.log`.
6. Independent source reviews checked canonical receiver identity, model/actor isolation, historical same-owner claims, source proof, page acknowledgement and replay. Review caught and fixed reconstruction using a live System name and service continuation lookup ignoring historical actor versions.
7. Explorer's regenerated schema capture passes its final typecheck. Source/document formatting and whitespace checks pass. The affected docs contain 515 valid local links/source ranges and 12 matching sequence/annotation groups. Source metadata hashes were refreshed.
8. Runtime deployment, Shopping browser verification and storage resets were not performed. Changed pre-release async storage and transported schemas require empty affected storage. The implementation is committed on local `main` without publishing it or creating a replacement PR.

## Remaining work

None.
