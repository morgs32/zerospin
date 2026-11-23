# Shopping reservations Service Agent and uncommitted release

**Date:** 2026-10-18

**Status:** Implemented and verified on 2026-10-18. After explicit user authorization, Shopping local dev storage was reset without recovery or migration, the backend accepted the system specification, and Reservations opened live and empty in Studio. No reservations were created or released.

**Prerequisite:** [Plan 244](244-plan-transient-agent-nodes.md) and [Plan 245](245-plan-remove-unnecessary-agent-and-runtime-machinery.md) are complete. Reuse their explicit Service Agent APIs, transient `ServiceAgentNode`, broker, admission and generic Studio inspector. This plan adds Shopping declarations and domain behavior; it does not reopen the framework design.

**References:** [ADR 018 — Shopping promotion ownership](../../adrs/018-shopping-promotion-ownership-and-observation.md), [ADR 015 — Service delivery ownership](../../adrs/015-service-delivery-history-and-projection-ownership.md), and [parallel-model rules](../../../packages/sdk/skills/zerospin-parallel-models/SKILL.md). [Plan 239](239-plan-shopping-promotion-reservations.md) remained active when this plan completed; its application verification subsequently passed on 2026-10-21. Generic framework/provider verification remains separate.

## Authorized startup amendment — 2026-10-18

The later user instruction, “Just reset Shopping’s local dev storage—no recovery
or migration. Then start the backend and open the reservations agent in Studio.
Don’t create any reservations,” supersedes this plan's earlier no-reset and
existing-data-preservation requirements only for the configured local Shopping
backend store. It authorizes no reservation creation, recovery/migration,
source reset, sibling-store reset, browser-storage clearing or deployment.
The historical startup failure below remains evidence of why the reset was needed.

## Result and scope

1. Add `reservations@1.0.0`, a Service Agent bound to `promotion@1.1.0`. Its live `promotionReservation` selection contains every shopper's rows with `status === 'reserved'` and `purchaseId === null`, including expired rows.
2. Expose only ordinary `releaseUncommittedReservation@1.0.0`, with payload `{ id }`. Each selected row uses Studio's existing command button, inspector and Submit flow. No Shopping-specific UI, new button framework or `availableWhen` metadata is needed.
3. Successful authoritative execution changes the existing canonical row's status to `released`. The row remains retained in Promotion and disappears from the Agent selection after projection. Node command state remains inspectable after that selection exit. Admission acknowledgement alone is not proof of successful execution; retained final evidence identifies the command's final result.
4. The command must refuse a missing reservation, any status other than `reserved`, or a nonnull `purchaseId`, using `promotion-reservation-not-releasable`. Expiry alone does not prohibit release. The authoritative transaction rechecks eligibility even if Studio's selected row was previously eligible.
5. Use existing data only. Add no reservations, seeds, fixtures, tests, profiles, runners, configuration, copy/backfill helpers or direct SQL mutations. An empty selection is valid. Do not release an existing reservation merely to manufacture verification evidence; leave submission to the user.
6. Add no overloads, Actor refactor, framework redesign, compatibility aliases or storage changes. Keep the customer-facing Promotion shopper Actor read-only. Administrative release does not change Cart or Purchase or initiate payment/cancellation work.
7. Preserve unrelated working-tree changes. Perform no publication, deployment, sibling rollout or storage reset. Do not verify Explorer.

## Current source and why versions change

1. [Shopping registration](../../../examples/shopping/src/zerospin/system.ts) currently supplies User `1.0.0` and Promotion `1.0.0`; [agents.ts](../../../examples/shopping/agents.ts) supplies only Purchases `1.0.0`. The new Service Agent can use the same browser-safe Agent registry already shared with Studio and `makeSystem`.
2. [PromotionReservationV1](../../../examples/shopping/src/zerospin/services/promotion/models/promotionReservation/PromotionReservationV1.ts) already contains the required status, nullable Purchase binding and expiry. Reuse that canonical model without schema changes.
3. [releasePromotion](../../../examples/shopping/src/zerospin/services/promotion/ReleasePromotionV1.ts) serves customer cancellation and Purchase-bound cleanup: it may create a cancellation row and may release committed allocations with Purchase identity. It is too broad for this Agent. Keep it unchanged and add the narrow ordinary contract.
4. Accepted definitions are immutable. A new Promotion release is necessary to register another command. Current [requestPromotionCommand](../../../examples/shopping/src/zerospin/aggregates/user/contracts/utils/requestPromotionCommand.ts) fixes the receiving Service version at `1.0.0`, and its stable command ID omits that version. Editing it in place would silently change retained request behavior.
5. New Promotion external contracts require new quotation/payment continuations and Apply/Remove/Checkout adapters because those declarations contain exact external-operation references. The new User release, User actor and Purchases Agent follow that graph. This is immutable Shopping wiring, not new Service Agent machinery.

## Contract and Agent declarations

1. Add browser-safe `ReleaseUncommittedReservationV1.ts`, exporting `releaseUncommittedReservationV1`, using `makeServiceContractVersion` and `defineServiceContract('releaseUncommittedReservation')`.
2. Declare version `1.0.0`, one reservation-ID payload field using the canonical reservation abbreviation, the canonical `promotionReservationV1` model and only its update operation. Use the existing ordinary-command success convention; add no domain response DTO.
3. Inside the ordinary command program, read by ID and perform the eligibility check before emitting the recorded update. ServiceVersionRepo's authoritative execution owns the real transaction; optimistic staging is only a local projection. The program has this behavior:

   ```text
   reservation = find reservation by payload.id
   if reservation is missing
      or reservation.status != 'reserved'
      or reservation.purchaseId != null:
       refuse 'promotion-reservation-not-releasable'
   record update of reservation.id with { status: 'released' }
   ```

4. Change only `status`; retain ID, shopper/Cart identity, null Purchase binding, expiry and creation time. Normal command execution owns the update timestamp. Never create or delete a reservation. Do not introduce an expiry check, extra query, cross-owner read or administrative bypass.
5. Add browser-safe `agents/reservationsAgentRelease.ts`. Construct its query database from the exact canonical model and use `makeServiceAgentRelease` with `agentName: 'reservations'`, `agentVersion: '1.0.0'`, `sessionName: 'reservations'`, `systemName: 'shopping'`, `serviceName: 'promotion'` and `serviceVersion: '1.1.0'`.
6. Declare one selection and one bound command:

   ```ts
   selections: {
     promotionReservation: db.query.promotionReservation.findMany({
       where: {
         status: { eq: 'reserved' },
         purchaseId: { isNull: true },
       },
     }),
   },
   contracts: {
     releaseUncommittedReservation: makeServiceAgentContract({
       contractVersion: releaseUncommittedReservationV1,
       model: promotionReservationV1,
       bind: { id: 'id' },
     }),
   },
   ```

7. Do not filter by shopper identity or acquire shopper credentials. Studio's existing credential-owning broker and bound single-use ticket establish administrative access to the registered Agent. Agent construction derives identity from its release; add no duplicate instance `agentName` input.
8. Reuse the generic Service Agent inspector and `stageServiceAgentCommand`. It already retains submitted command identity independently of selected model rows, including while the resource view is unavailable. Do not add a second command store, Session journal, lifecycle subscription or outcome-fetch loop.

## Immutable version rollout

Retain the existing `1.0.0` definitions and their original request behavior. Introduce the following new declarations:

| Definition                                                                                                   | New version / binding                            |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Promotion Service release                                                                                    | `promotion@1.1.0`                                |
| Ordinary administrative command                                                                              | `releaseUncommittedReservation@1.0.0`            |
| `reserveExternalPromotion`, `commitExternalPromotion`, `releaseExternalPromotion`, `redeemExternalPromotion` | `1.1.0`                                          |
| `getExternalPurchaseQuote`, `processExternalPayment`                                                         | `1.1.0`                                          |
| User Aggregate release                                                                                       | `user@1.1.0`                                     |
| User actor                                                                                                   | `user@1.1.0`                                     |
| Purchases Agent                                                                                              | `purchases@1.1.0`, bound to User `1.1.0`         |
| Reservations Agent                                                                                           | `reservations@1.0.0`, bound to Promotion `1.1.0` |

1. Add `promotionServiceReleaseV1_1` using unchanged reservation model, four existing Promotion Service contracts and read-only `shopperActorV1`, plus the new administrative contract. The shopper Actor keeps version `1.0.0` and `contracts: {}`.
2. Add an explicit `requestPromotionCommandV1_1` helper. Preserve the existing helper's destination, command-ID derivation, receipt checks and retry behavior for old requests. The new helper addresses Promotion `1.1.0` and uses exactly `cmd_promotion_` plus `encodeURIComponent(JSON.stringify(['1.1.0', input.reservationId, input.action, input.purchaseId]))` as its stable Service command ID. Freeze that command before transport retries. Do not derive the destination from the current app version or silently reroute a retained old request.
3. Add the four `1.1.0` Promotion external contracts, calling only the new request helper. Add quotation/payment external contracts at `1.1.0`; their downstream commit/payment/release/redeem references must remain entirely within the new continuation graph. Preserve Marketplace `1.0.0`, provider calls, payment key/amount validation, response schemas, failure semantics and business programs.
4. Create release-local Apply/Remove/Checkout server adapters referencing the existing canonical public ordinary contract objects. Change their external-operation references to the new declarations. Reuse the unchanged ordinary public contract versions, model versions, tracking contracts and provider behavior. Do not version unrelated declarations or introduce a generic version-switching factory.
5. Compose User `1.1.0` and User actor `1.1.0` with those adapters and external contracts. Add Purchases `1.1.0` with its existing selections/tracking bindings and the new User release binding. Preserve old releases/actors/Agents for their actual retained history and pending origins, without compatibility shims.
6. Register both User/Promotion releases in `system.ts` and both Purchases releases plus Reservations in `agents.ts`. Move current `shopperSessionDefinition` to User/actor `1.1.0`; move `promotionSessionDefinition` to Promotion `1.1.0` while retaining shopper Actor `1.0.0`. Existing React and SharedWorker wiring consumes these definitions; do not add another Session registration path.
7. New User and Promotion materializations reconstruct existing state by replaying retained Chain history through their own declarations. Never query another release and copy its model rows. Replay must not issue new provider requests or Promotion commands. Existing initializers, seeds and domain data stay unchanged.

## Local cutover and existing-data safety

1. Establish a local window with all old shopper producer lifetimes stopped, including old browser Sessions/SharedWorkers and any other old command producer. Keep them stopped after cutover; refreshing source alone does not retire an already-running old Session. Keep the Reservations Agent unopened until this gate passes.
2. Start or reuse the Shopping backend with the intended accepted specification while old shoppers remain stopped and Reservations remains unopened. Retained `1.0.0` declarations allow that bundle to settle existing originals; a separate old-backend launch is unnecessary. Let old-version Promotion, quotation, payment and continuation work settle through existing command/delivery procedures. Do not cancel requests, fabricate commands, edit domain rows, clear queues or reset storage to make the gate pass. Provider uncertainty or work that cannot settle is a blocker to report.
3. Inspect current durable state using existing administrative inspection. For each affected User Aggregate, record the AggregateChain head, verify that originals and admitted continuations through that head have retained `outcome`, and verify that quotation/payment/four Promotion external-operation outboxes contain no remaining work. Follow any newly admitted continuation until the observed state is stable. Outbox emptiness alone is insufficient: recording an external observation deletes that request while admitting its continuation, before execution of that admitted command.
4. Require the relevant AggregateVersionRepo materialization and AggregateVersionChain publication to cover those recorded heads, with pending publication drained. Likewise record the Promotion ServiceChain head, verify retained original outcomes and catch up ServiceVersionRepo/ServiceVersionChain publication. A dispatch acknowledgement, execution commit and retained `outcome` are separate evidence; record the actual durable facts.
5. Catch new User/Promotion releases and the Reservations projection up through the recorded settled heads before opening administrative release. Use existing catch-up/activation machinery. If complete old history is unavailable or replay fails, report the exact blocker; do not synthesize missing rows or introduce another recovery mechanism.
6. Promotion `1.0.0` does not know the new command. Existing Service replay records a refusal for that unsupported command and advances its own `serviceIndex`/`dispositionChainHash`; its old row can remain `reserved` after `1.1.0` releases it. Do not promise cross-version administrative release or add the new command to the immutable old release. This is why no old producer or old Promotion observation Session may remain active after the local cutover. An old commit request could otherwise succeed against the separate old materialized view.
7. If old producers cannot be retired or old work cannot settle, keep administrative release unused and report the specific blocker. Do not build a deployment coordinator, new lock table, runtime gate, availability metadata or version fallback. Preserve storage and the unfinished plan.
8. This plan changes no fixed schemas. If existing framework storage refuses activation because an earlier schema cutover requires empty storage, stop and report the exact incompatibility. Do not reset storage, add a decoder/migration or treat an empty replacement database as “existing data.”

## Implementation sequence and file map

1. Reinspect the current declarations, accepted-version assumptions, pending-work inspection paths and healthy local processes before editing. Preserve Plan 244/245 and unrelated work. Keep old producers stopped before permitting administrative use.
2. Add the narrow contract and Reservations Agent, then wire the immutable declaration graph and current Session bindings above. Keep old version files executable and unchanged in behavior.
3. Run the existing scoped checks and review the named behavioral seams. Start/reuse the accepted Shopping backend to establish the local cutover using existing data and delivery procedures. Keep Reservations unopened until the gate passes.
4. Start/reuse Studio, verify readiness and open the Reservations Service Agent for the user after the cutover evidence is complete. Do not submit a release on the user's behalf as a check.
5. Reconcile documentation with actual implementation, record evidence and any blocker, then archive only after all permitted work is complete.

`+` creates a file; `~` modifies a file. Existing `1.0.0` declaration files are retained, not replaced or renamed.

```text
zerospin/
├── examples/shopping/
│   ├── ~ agents.ts
│   ├── ~ README.md
│   └── src/zerospin/
│       ├── ~ system.ts
│       ├── ~ shopperSessionDefinition.ts
│       ├── ~ promotionSessionDefinition.ts
│       ├── agents/
│       │   ├── + reservationsAgentRelease.ts
│       │   └── + purchasesAgentReleaseV1_1.ts
│       ├── services/promotion/
│       │   ├── + ReleaseUncommittedReservationV1.ts
│       │   └── + promotionServiceReleaseV1_1.ts
│       └── aggregates/user/
│           ├── + userAggregateReleaseV1_1.ts
│           ├── actors/+ userActorV1_1.ts
│           └── contracts/
│               ├── + applyPromotionServerV1_1.ts
│               ├── + removePromotionServerV1_1.ts
│               ├── + checkoutServerV1_1.ts
│               ├── + reserveExternalPromotionV1_1.ts
│               ├── + commitExternalPromotionV1_1.ts
│               ├── + releaseExternalPromotionV1_1.ts
│               ├── + redeemExternalPromotionV1_1.ts
│               ├── + getExternalPurchaseQuoteV1_1.ts
│               ├── + processExternalPaymentV1_1.ts
│               └── utils/+ requestPromotionCommandV1_1.ts
└── wiki/
    ├── plans/+ 246-plan-shopping-reservations-service-agent.md
    ├── ~ glossary.md
    ├── architecture/~ relevant Shopping/Agent workflow descriptions
    └── adrs/~ 018-shopping-promotion-ownership-and-observation.md
```

## Verification, startup and completion

1. Use existing Nx targets only, with explicit projects and dependencies in one graph: Shopping `ts`, `lint`, `build`; Studio and CLI `lib`, `ts`, `lint` for the consumed declaration/launch path. Reuse passing framework checks from Plan 245 unless implementation actually changes framework source. Inspect current target configuration before execution; do not invent a Shopping `lib` target or run root all-workspace wrappers.
2. Run the existing root `test-external-types` and `test-external-examples` selection in a subsequent graph. These existing checks do not authorize new fixtures or runtime data. Run scoped formatting and `git diff --check` on this plan's changed files. Check imports, browser-safe Agent bundling, unchanged old-version request behavior, new stable IDs and exact canonical public contract references.
3. Review the following against source and existing permitted checks, without adding tests:

   | Seam                               | Required conclusion                                                                                                                                                                                                                  |
   | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | Authoritative refusal              | Missing, non-reserved and Purchase-bound rows refuse without writes; expired otherwise-eligible rows release; race after local staging is rechecked in ServiceVersionRepo's transaction.                                             |
   | Domain scope                       | Only existing reservation status changes. Canonical row remains retained; Cart/Purchase, provider state, expiry and shopper-facing command allowlists remain unchanged.                                                              |
   | Administrative admission           | Exact registered Reservations/Promotion/version/model/contract binding and broker-owned credentials remain required. Wrong-Agent/Service/contract admission remains rejected by existing framework validation.                       |
   | Selected view and private evidence | Successful final execution removes the row through normal selected publication. ServiceAgentNode retains normalized command state after selection exit, through reconnect and unavailable-view intervals, until normal disposal.     |
   | Version graph                      | Old requests retain their destination/ID and exact external contract resolution. New producers/continuations use the complete `1.1.0` graph; replay materializes existing history without reissuing external work or copying models. |
   | Local cutover                      | Old producers are retired, old work has durable final evidence, materialization/publication are caught up, and no relevant pending external work remains. Provider uncertainty and schema refusal are explicit blockers.             |
   | Lifecycle                          | Once-only Session readiness, current Node write/view/connection state, exact retry, fresh-ticket reconnect and joined disposal reuse Plan 245's existing machinery.                                                                  |

4. Start or reuse a healthy backend through `pnpm nx run shopping:zerospin:dev` as needed to establish the cutover gate. Verify actual backend readiness and acceptance of the intended system specification, not merely a listening process. Keep old shopper producers stopped and Reservations unopened while existing work settles and new materializations catch up. Preserve storage; bounded startup failure must report the concrete error.
5. From `examples/shopping`, run the existing built Studio CLI (`node ../../packages/cli/dist/cli.js studio`) or reuse a healthy Studio that has loaded the new Agent registry. Verify the actual Studio ready URL and backend/broker readiness, then open the existing Service Agent route `/service-agents/promotion/1.1.0/reservations/1.0.0`. Do not launch or drive the Shopping app to generate data. An empty selection is a successful valid state. Leave the command inspector and Submit flow available to the user.
6. Report which checks executed, pre-existing warnings, cutover evidence, startup URLs and any blocker. The new contract/Agent/refusal/reconnection behaviors have source review without dedicated new automated runtime coverage; existing regressions and an open Studio page do not prove them. Do not claim a release was executed unless the user actually submits one and its final evidence is observed.
7. After implementation, update Shopping README, glossary, relevant architecture workflow/source links and ADR 018's description of the administrative exception and version cutover. Reuse existing terminology and decisions; no new ADR is expected. Preserve Plan 239 and earlier deferred verification statuses. Keep this plan active if any required check, cutover or startup remains blocked; archive with repaired links only when no work remains.

## Implementation and verification record — 2026-10-18

1. Added the ordinary browser-safe release command, Promotion `1.1.0`, and
   Reservations `1.0.0` with the exact selection and bound command. The command
   reads the canonical row, refuses missing/non-reserved/Purchase-bound rows and
   records only `status: 'released'`. It does not inspect expiry or mutate another
   model. No reservations or other domain rows were created or submitted.
2. Added the six external `1.1.0` declarations, three release-local adapters and
   explicit version-qualified Promotion request helper. Added User release/actor
   and Purchases Agent `1.1.0`, registered old/new versions and moved current
   Session bindings. All existing Shopping TypeScript files outside the four
   planned registration/Session-binding files are byte-identical to the task-start
   snapshot. No framework source, provider behavior, fixed schema, tests, seeds,
   fixtures, runners or configuration changed.
3. Independent source review confirmed exact canonical Model/public-contract
   identity, the narrow Agent allowlist, unchanged shopper Actor `contracts: {}`,
   the complete new continuation graph and old request behavior. Framework source
   confirms that ServiceVersionRepo reevaluates in its authoritative transaction,
   selection removal and private command evidence have separate lifetimes, and
   wrong-Agent/Service/contract binding remains refused. Existing external
   continuation decoding validates source and executing contracts separately;
   the unchanged payload/response shapes need no new adapter or compatibility path.
4. `NX_NO_CLOUD=true pnpm nx run-many -t lib ts lint build -p shopping @zerospin/studio @zerospin/cli --parallel=3`
   passed: 23 tasks including dependencies, 6 cache hits. Shopping typecheck/build
   and Studio/CLI declarations/typechecks/lint passed. Four copied curly warnings
   in new continuation files were subsequently fixed with braces only; the scoped
   Shopping lint rerun passed with only its 3 existing SharedWorker URL-import
   warnings. Studio retains its existing 1 curly warning. The Shopping build also
   retains its existing large-chunk notice; no runtime behavior is inferred from
   build output.
5. `NX_NO_CLOUD=true pnpm nx run-many -t test-external-types test-external-examples -p zerospin --parallel=2`
   passed: external typecheck and all 6 existing regressions, 8 tasks including
   dependencies, 6 cache hits. No new automated runtime coverage was added.
6. Scoped formatting/checks and whitespace/link/source-hash validation cover this
   plan's changed files. Updated Shopping README, glossary, relevant AuthoredSystem
   descriptions/source links and ADR 018. Earlier deferred statuses, including
   Plan 239, remain unchanged. No Explorer verification was run.

### Initial backend attempt and storage blocker — resolved by authorized reset

1. Process/listener inspection found no running Shopping development backend or
   Shopping app producer. Chrome inventory contained no Shopping tab; the current
   Dia window likewise showed no Shopping tab. No browser login/session was reset.
2. Started `NX_NO_CLOUD=true pnpm nx run shopping:zerospin:dev` against the existing
   configured `sys_shopping_20260907_pinned_replicas` storage, without `--clean` or a
   replacement directory. Wrangler briefly listened on `http://127.0.0.1:3005`, but
   SystemRepo activation failed with `migratable-do-repo-ledger-failed` / `Failed
to read migration history`. CLI system-spec acceptance did not complete and
   Wrangler shut down; there is no healthy backend listener. Nx's outer task
   reported success despite the inner CLI failure; that is not startup readiness.
3. Read-only SQLite inspection establishes the incompatibility in
   `examples/shopping/.wrangler/zerospin/dev-worker/sys_shopping_20260907_pinned_replicas/v3/do/shopping-zerospin-SystemRepo/2633abede18e2448a696c5cfacc821b25cd734d74d1c9196a0208b0cb7b42115.sqlite`:

   | Table                 | Retained columns                      | Current required columns            |
   | --------------------- | ------------------------------------- | ----------------------------------- |
   | `applied_migrations`  | `id`, `name`, `checksum`, `appliedAt` | `migrationId`, `definitionChecksum` |
   | `acceptedDefinitions` | `key`, `definition`                   | `key`, `spec`                       |

   Current `migrationLedger.readMigrationLedger` validates the ledger schema before
   reading it. The first mismatch blocks SystemRepo activation; the second is an
   additional observed incompatible table, not a second successfully executed
   activation error. The retained Marketplace ServiceVersionRepo also contains
   superseded framework tables, so repairing or replacing only the ledger would
   not establish storage compatibility.

4. Preserved the existing directory and all domain data. Added no compatibility
   decoder, translation migration, manual SQL repair, reset or fresh empty store.
   Since backend activation failed, the durable old-work/head/publication gate and
   new materialization catch-up could not be established. Studio was not started
   and Reservations was not opened, rather than presenting a failing Agent as
   ready. No reservation was released for verification.
5. Startup log: `/tmp/plan246-backend.log`; scoped check logs:
   `/tmp/plan246-checks.log`, `/tmp/plan246-external.log`, and
   `/tmp/plan246-shopping-final-lint.log`. Source review is distinct from live
   Agent/refusal/reconnection verification, which remains unperformed.

### Authorized reset and completed startup — 2026-10-18

1. The user explicitly replaced the existing-data-preservation requirement for
   Shopping local dev storage with an instruction to reset it, without recovery
   or migration, and retained the prohibition on creating reservations. No further
   permission was needed for that exact reset.
2. Verified the configured persistence directory and every path component below
   the repository root were not symlinks, that no process held the directory open,
   and that ports 3005/5555 had no listeners. The exact reset scope was
   `examples/shopping/.wrangler/zerospin/dev-worker/sys_shopping_20260907_pinned_replicas`
   (66 files, 6,137,256 bytes before reset). Preserved source, environment files,
   browser state, the sibling `before-framework-goal-20261011` store and other
   projects. No new backup, recovery, migration or compatibility code was added.
3. Ran `NX_NO_CLOUD=true pnpm nx run shopping:zerospin:dev -- --clean`. The existing
   CLI removed only that configured store and provisioned current storage. Verified
   current SystemRepo columns `migrationId/definitionChecksum` and `key/spec`.
   The backend reported `Ready on http://127.0.0.1:3005/ (system spec accepted)`
   and remained listening. This resolves the earlier schema activation blocker;
   the prior failed startup is not passing evidence.
4. Started the existing CLI with `node ../../packages/cli/dist/cli.js studio`
   from `examples/shopping`. Verified Studio HTTP 200 at `http://127.0.0.1:5555/`
   and a successful broker response from `/api/repos/SystemRepo`, establishing
   authenticated backend access without exposing credentials.
5. Opened
   `http://127.0.0.1:5555/service-agents/promotion/1.1.0/reservations/1.0.0`
   in Chrome and kept the tab open as the requested result. The visible Agent
   reports `Connection: live`, `0 results` and `No matching rows.` Its existing
   selection table is usable. The backend recorded a successful Service socket
   upgrade. No shopper app was launched and no command Submit action was used.
6. Existing broker read-only inspection confirmed: SystemRepo has zero Aggregate
   registrations; ServiceChain has no registered instance; Promotion `1.1.0`
   ServiceVersionChain has zero commands and Reservations subscriber acknowledgement
   `0`; the Reservations Repo has zero reservation rows, zero materialization-head
   rows and zero pending exposed-command publications; the Agent Chain has zero
   exposed commands and zero private command resolutions. Empty head/history
   represents genesis `serviceIndex: 0` under the existing snapshot procedures.
   The authorized fresh reset removes the old-history settlement obligation for
   this local run; no retained work was migrated or claimed recovered. No reservation
   was created or released.
7. Backend and Studio remain running for the user. Startup logs are
   `/tmp/plan246-backend-reset.log` and `/tmp/plan246-studio.log`; read-only broker
   evidence is `/tmp/plan246-live-inspection.json`; the visible ready state was
   captured in `/tmp/plan246-reservations-studio.png`. Scoped source checks from
   the implementation record remain passing; no source changes required rerunning
   them. Documentation formatting, links and whitespace checks passed after this
   amendment and archival.
8. Live evidence covers reset, accepted backend/broker startup, Agent admission,
   first replay and the empty selected view. It does not exercise successful
   release, authoritative refusal, concurrent eligibility changes or reconnection;
   those seams retain the source-review/no-new-automated-coverage qualification.
   No seed, test reservation or release was manufactured for verification.
   Plan 239 and earlier plans retain their independent deferred statuses.

**Remaining work:** None.
