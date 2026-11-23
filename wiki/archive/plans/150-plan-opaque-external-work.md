# Opaque external work and originating-chain continuations

**Date:** 2026-10-14

**Status:** Implemented and verified on 2026-10-14. Decisions remain locked.

## Problem and governing inputs

External operations currently combine authored requests with framework routing to another aggregate or service. They duplicate source identity and retain inert async descriptions during replay and replica delivery. Shopping uses a no-op external request to turn Marketplace checkout into a user purchase command.

This plan incorporates the [opaque-work handoff](../handoffs/2026-10-14-handoff-opaque-external-work.md) and the [source research](../../research/external-work-and-continuation-addressing.md). The handoff's originating-**chain** correction governs: returning a response to that chain does not limit all continuation execution to the originating VersionRepo. [ADR 012](../../adrs/012-opaque-external-work-and-originating-chain-continuations.md) records the accepted replacement of ADRs 001 and 010. ADRs 005, 008 and 011 retain their ordering, authority and retry responsibilities.

## Locked decisions

1. `external.request({ payload })` is opaque authored work. Provider endpoints, Slack recipients, remote commands and other request internals belong to the author. The framework retains invocation identity, frozen input, authority and outcomes for durability; it does not interpret a request destination.
2. Persist and run external work only in the VersionRepo that executes the original command. Replay may evaluate its version's program and record model changes, but creates no async-operation rows. Replica output carries model changes without async-work descriptions.
3. Resolve pending external declarations in the originating repo's release, using the exact stored external contract name/version. Original emission validation requires that release to register the exact canonical declaration. An aggregate schedules aggregate-local external work; a service schedules service-local external work.
4. Return a recorded response to the originating admission chain. Aggregate routing is derived from `{ systemId, aggregateName, aggregateId }`; service routing from `{ systemId, serviceName }`. Offer no alternate continuation recipient in the external-operation API.
5. Preserve the originating `aggregateVersion` or `serviceVersion` and exact external contract version on the continuation command. Chain admission, ordered original execution and normal version replay remain intact. Do not choose the latest release or force every replay to execute in the original repo.
6. Delete `receivingAddress`, `emissionOwnerKind`, `emissionOwnerName` and `emissionOwnerVersion` from descriptors, schemas, stored work and callers. Do not replace them with renamed fields, bindings or routing envelopes. Remove `sourceOwner`/owner-kind dispatch wherever the concrete repo or chain supplies that identity; derive the source repo for complete-child proof from the bound chain and retained command release.
7. Keep the table name `asyncOperations` in the physically separate AggregateVersionRepo and ServiceVersionRepo databases. Keep concrete aggregate/service row and procedure types where their context differs; share cohesive lifecycle procedures without a redundant family discriminator.
8. Rename `producerFailure` to **`externalFailure`** outright. It remains the first committed terminal failure before a response is recorded; `null` means no failure has been recorded. Continuation-delivery failures remain independently recorded as `lastDeliveryFailure` in the outbox.
9. Retain synchronous response/outbox atomicity, immutable first outcomes, recorded JSON-null success, stable child IDs, frozen origin/System name and complete source proof. Recorded-child reconstruction needs neither the originating command nor a current external declaration. Fresh recorded admission still validates its declaration and authority after exact retained-child recovery.
10. Keep author-owned retries and provider idempotency/reconciliation, configurable `timeoutMs` with its 30-second default, unfinished-work alarm recovery, live non-overlap and independent delivery recovery. Recording a failure creates no continuation and cannot change the originating command's result. Preserve both Causes if failure recording also fails.
11. Keep each model operation's original authored `operationIndex` after filtering async entries. Sparse indexes are valid. Validate safe nonnegative, strictly increasing, unique indexes and correct command/aggregate or service position association; pass the retained index to application instead of the filtered array ordinal. Never renumber model operations.
12. Use the existing authenticated backend command API for Shopping's authored cross-owner request. Add no new declarative command-emission framework. The recipient is ordinary application data inside its frozen request payload, not framework continuation metadata.
13. Apply the pre-release hard cutover to affected fixed storage and transported schemas: empty affected storage, no aliases, dual paths, fallback decoders, translation migrations or deprecated-row preservation. This plan does not authorize a storage reset, deployment, publication or consumer-repository edits.

## Locked Shopping replacement

1. Replace user `asyncCreatePurchaseV1` with ordinary system-authorized `createPurchaseV1`. Preserve quote consistency/conflict checks and created/already-existing results. It owns purchase/item writes and schedules user-local payment only when a purchase is newly created.
2. Add Marketplace-owned `asyncCreatePurchaseV1`. Its `external.request` submits the ordinary user command and returns its recorded domain result; its continuation goes to the Marketplace chain. Checkout still freezes the quote, deletes cart items and returns the quote in the originating transaction.
3. Generate the remote command ID once with public `sdk.CuidFactory` during original synchronous checkout evaluation. Freeze it with the verified user identity, exact user release/contract/System metadata and quote before scheduling the request. Preserve the exact serialized command input across retries and recovery. Do not run a fresh-ID command maker inside `external.request`. Distinct admitted checkout attempts keep distinct command IDs so quote conflicts remain the user command's domain responsibility.
4. Add app-owned `ShoppingSystemApi` and `ShoppingSystemApiLive`. Expose the lazy Effect-facing SystemApi capability directly, using the existing effect-valued app-service pattern; add no forwarding `createPurchase` wrapper. Acquire the environment lazily so importing config in the Node CLI does not require a live Worker environment. Mirror Shopping appWorker's existing `getApi<GatewayApi>(url)(gateway => gateway.getSystemApi(...))` API acquisition.
5. Merge that layer into `zerospin.config.ts`. Declare and validate app-owned backend `SHOPPING_ZEROSPIN_API_URL` and existing `ZEROSPIN_SECRET_KEY` bindings. Local bindings use the existing project-root environment loader; deployed Worker configuration must provide the endpoint explicitly. Do not assume the generated backend already supplies `ZEROSPIN_API_URL`, add a framework custom-vars hook, hardcode a secret or carry credentials in persisted payloads. Verify the configured Worker-to-command API route as part of implementation.

## Implementation steps

1. Cut address/emitter fields and foreign-family emission permission from concrete external operation types/codecs, declaration/System validation and author-facing APIs. Resolve each scheduled declaration against the originating release and update all in-repo callers, including Shopping, fulfillment and Tic Tac Toe. Keep provider request payloads opaque.
2. Cut superseded work columns, use `externalFailure`, and derive reconstruction, chain routing and source proof from concrete repo/chain context. Preserve complete retained-child comparisons and synchronous transaction boundaries; remove the generic cross-address grouping/dispatch path instead of leaving an unused alternative.
3. Make replay discard async output before external preparation or persistence. Make authoritative journal output and replica/projection codecs/readers model-only. Remove async-row transport validation and update sparse model-index validation/application deliberately for mixed model/async authored output.
4. Implement the Shopping replacement above with the ordinary command API and app-owned capability layer. Preserve system authorization, stable remote retry input, user quote conflicts and created-only payment; verify uncertain remote acknowledgement independently from local response recording.
5. Update the existing declaration inference and runtime acceptance files and relevant existing Workerd coverage. Delete superseded addressed/replay-emission assertions; prove the new behavior using production procedures. Create no new test files, fixtures, test/check runners or their configuration.
6. Reconcile affected module READMEs, architecture workflows and annotations, local patterns, consumer external-work guidance, glossary and Explorer schema capture with implemented behavior. Keep current-source descriptions separate from intended design until this cutover lands. Amend governing ADRs only if implementation changes a decision.
7. Complete the scoped checks below, resolve in-scope failures and obtain an independent review of original/replay ownership, sparse operation indexes, recorded proof and Shopping retry behavior. Record evidence and archive this plan only when implementation and required verification are complete.

## Planned file hierarchy

Legend: `+` create, `~` modify, `-` delete. Root is `zerospin/`. Directory entries name the bounded files affected by that responsibility, not permission for a broader cleanup.

```text
zerospin/
  packages/core/src/contracts/                            ~ local external descriptors/types and declaration validation
  packages/core/src/declaration/                          ~ local external permission checks
  packages/core/src/system/make/makeSystem/                ~ originating-release external registration
  packages/core/verification/plan140.ts                   ~ existing inference acceptance
  packages/system-worker/src/asyncOperations/             ~ work schema, runner, reconstruction and source proof
  packages/system-worker/src/asyncOperations/AsyncAddressSchema.ts - superseded address abstraction
  packages/system-worker/src/{Aggregate,Service}VersionRepo/ ~ original-only work; model-only output
  packages/system-worker/src/{Aggregate,Service}Chain/     ~ originating-chain recorded admission/proof
  packages/system-worker/src/{aggregateProjection,serviceProjection}/ ~ model-only transport and sparse indexes
  packages/system-worker/src/repoServices/                ~ concrete recorded-delivery RPC schemas
  examples/shopping/src/zerospin/ShoppingSystemApi.ts       + authored capability service
  examples/shopping/src/zerospin/ShoppingSystemApiLive.ts   + lazy configured backend API capability
  examples/shopping/src/cloudflare-workers.d.ts            ~ app-owned backend endpoint binding
  examples/shopping/zerospin.config.ts                     ~ capability layer
  examples/shopping/src/zerospin/aggregates/user/contracts/asyncCreatePurchaseV1.ts - no-op external bridge
  examples/shopping/src/zerospin/aggregates/user/contracts/createPurchaseV1.ts + ordinary purchase command
  examples/shopping/src/zerospin/aggregates/user/userAggregateReleaseV1.ts ~ ordinary purchase registration
  examples/shopping/src/zerospin/services/marketplace/contracts/asyncCreatePurchaseV1.ts + opaque remote request/local continuation
  examples/shopping/src/zerospin/services/marketplace/marketplaceServiceReleaseV1.ts ~ local external registration
  examples/shopping/src/zerospin/services/marketplace/contracts/checkout/checkoutServerV1.ts ~ frozen remote invocation
  examples/shopping/src/zerospin/{aggregates,services}/     ~ remaining local external emitters
  examples/tic-tac-toe/src/contracts/                      ~ local external invocation
  scripts/verify-plan140.mjs                              ~ existing runtime acceptance
  explorer/src/data/schema-snapshot.json                  ~ existing generated schema capture
  wiki/architecture/                                     ~ affected workflows/citations after implementation
  wiki/patterns/contracts/                                ~ local external authoring after implementation
  wiki/glossary.md                                        ~ reconcile implemented meanings
  wiki/adrs/012-opaque-external-work-and-originating-chain-continuations.md + locked decision
  wiki/adrs/{001,005,008,010,011}-*.md                     ~ supersession and retained guarantees
  wiki/handoffs/2026-10-14-handoff-opaque-external-work.md  ~ incorporate into this plan
  wiki/research/external-work-and-continuation-addressing.md ~ link corrected locked boundary
  wiki/plans/150-plan-opaque-external-work.md              + this plan
```

## Required verification

1. Update and run existing `packages/core/verification/plan140.ts` for local aggregate/service descriptors, payload inference and rejected alternate-recipient/foreign-family usage. Old compatibility-only assertions are removed.
2. Update and run existing `scripts/verify-plan140.mjs`: original-only async rows, zero replay async rows/descriptions, mixed output with sparse model indexes, originating-chain delivery with retained command versions, complete-child tamper refusal and retained recovery without live declaration/source command. Reuse its existing settlement, null response, alarm/interruption and delivery recovery seams; keep scenarios concise.
3. Reuse existing Shopping contract/SQLite and Workerd seams for frozen API command retries, duplicate receipt recovery, changed quote rejection and payment emitted only for a new purchase. Verify real gateway/API acquisition through the existing Worker seam with configured app bindings; mocked/in-memory checks alone do not establish that integration. Shopping browser verification is prohibited.
4. Use one scoped Nx graph with dependencies for Core/SDK library builds and actual typechecks, System-Worker library/types/lint and existing Workerd tests, Shopping/Tic Tac Toe types/build/lint, and Explorer's actual `typecheck`/build/lint. Do not count disabled echo-only typecheck tasks as verification. Discover/reuse exact project configurations before execution and extend the graph only to directly affected consumers.
5. Regenerate Explorer's existing schema capture; format changed files and check whitespace, links/source ranges and changed architecture diagram/annotation pairs. Run no whole-repo polish or additional CI/publication workflow.
6. Independent review must check frozen source proof, original/replay separation, correct sparse-index association, identical remote retries and absence of removed fields/compatibility paths. The outcomes below record completed contained checks; no deployment or real-provider delivery is claimed.

## Open decisions

None. The architecture, naming, Shopping bridge/service boundary and verification scope above are locked. Implementation may resolve routine local details without reopening them; a source-backed contradiction must be reported explicitly.

## Outcome and verification

1. Implemented payload-only, family-local external declarations and original-VersionRepo-only durable work. Deleted receiver/emitter fields and generic cross-address delivery; renamed the terminal field to `externalFailure` and made origin/System/child identity required. Kept existing concrete `asyncOperations` tables.
2. Continuations return to the originating chain with original release/contract metadata. Frozen reconstruction, complete-child proof, exact retry recovery, synchronous response/outbox recording, immutable first outcomes and separate request/delivery recovery remain intact.
3. Replay creates no async rows and replicas receive model-only output. Model operations keep authored sparse indexes; projection validates and applies those retained indexes.
4. Shopping now generates and freezes one ordinary user command in checkout, calls it from Marketplace-owned opaque work through the authored lazy SystemApi capability, retries only transport uncertainty twice, and resumes locally. User quote validation/conflicts and new-purchase-only payment remain. Configured Worker integration proves actual gateway/API acquisition; backend operators must provide `SHOPPING_ZEROSPIN_API_URL` and `ZEROSPIN_SECRET_KEY`.
5. Scoped Nx library/build/type/lint and Workerd type checks passed for Core, SDK, System-Worker, Shopping, Tic Tac Toe and Explorer with dependencies. Actual Core/SDK `tsc:typecheck` passed with `--skipSync`; disabled echo tasks were not treated as evidence. Logs: `/tmp/zerospin-plan150-final-quality.log`, `/tmp/zerospin-plan150-types.log`, `/tmp/zerospin-plan150-explorer.log`.
6. All 20 existing Workerd tests across five files passed on the final checkout, including the configured Shopping API/duplicate receipt/quote refusal/created-only payment seam. Log: `/tmp/zerospin-plan150-final-workerd.log`. The existing runtime acceptance passed all eight groups, including actual checkout evaluation, one Cuid allocation, identical retry input, original/replay sparse output, frozen proof, terminal outcomes, null response, alarm/interruption and delivery recovery. Log: `/tmp/zerospin-plan150-runtime.log`.
7. Existing `packages/core/verification/plan140.ts` passed the standalone strict inference check from Plan 147. Log: `/tmp/zerospin-plan150-inference.log`. Explorer captured nine concrete Repos and 50 table declarations without executing Worker modules. Changed-file formatting, whitespace, documentation links/ranges, source metadata and changed diagram/annotation checks passed. Independent source reviews found no actionable correctness issues.
8. Six pre-existing Explorer UI lint warnings and Nx Cloud access code 401 remain; local checks passed. Concurrent unrelated API/model/release work was preserved. No new test files, fixtures, runners or test configuration were created; the temporary test-ts resolution change was reverted. No Shopping browser verification, real provider request, deployment, publication, storage reset or compatibility migration was performed.

## Remaining work

None.
