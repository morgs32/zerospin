# Service ordered operations and one logical finalization time

**Date:** 2026-10-16

**Status:** Complete, 2026-10-22. Ordered-output, replay-time, original-result recovery, publication and Actor/Agent projection verification pass at the production Workerd/SQLite seams under Plan 151. Archived after the checks and preservation review below; parent Plan 151 remains active.

**Replay-time follow-up:** [Plan 239](239-plan-shopping-promotion-reservations.md) amends the original fresh-replay-time rule below: original Service execution samples one logical finalizedAt, replay reuses the retained original outcome.finalizedAt, and synchronous validation/evaluation receives a frozen Effect wall Clock. Resource writes and retained outcome use that same logical time; monotonic timing/sleep, external requests, alarms and ordinary queries remain live. No new timestamp column or caller clock protocol is added. The scoped verification below establishes that repair at the materialization and Clock-scope seams, independently of Shopping application closure. The recovery/publication verification below completes the remaining Plan 214 obligations.

**Subsequent amendment:** Completed [Plan 215](215-plan-service-commands-backed-actor-fanout.md) removes the physical ServiceVersionChain actor fanout copy and shared copy-maintenance hooks. Complete ten-field commands and logical actor delivery remain; delivery/catch-up now read commands directly and acknowledgement advances only subscriber progress. The Plan 214 payload-copy implementation descriptions below are historical where superseded by Plan 215. This plan verifies its output/history/publication responsibilities against that current source; Plan 215 subsequently completed its separate fanout/enrollment verification on 2026-10-22. The removed copy/hooks must not be restored.

**Pending-request amendment:** [Plan 219](219-plan-service-external-operation-outbox.md) subsequently removes the two pending lineage columns and their index. Current ServiceChain pending storage has six complete invocation fields; the eight-field clauses below describe the original cutover boundary and are superseded.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [ServiceVersionRepo.serviceVersionChainOutbox](../../reviews/storage-tables/service-version-repo-service-version-chain-outbox.md). **Governing ADRs:** [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md). [Plan 196](196-plan-service-chain-original-operations-and-external-work.md) and [Plan 213](213-plan-aggregate-external-operation-outbox.md) subsequently completed their independent execution/delivery proofs. Plans 211/212 retain their applicable public-observer obligations under Plan 151. [Plan 257](257-plan-direct-system-worker-verifications.md) retires the original verification harness named in the dated reports below.

## Recovery, publication and projection verification — 2026-10-22

Four focused cases extended the then-existing `agent-runtime.spec.ts`, `agentRuntimeConfig.ts` and `agentRuntimeWorker.ts`, using production Repo classes and fresh disposable Miniflare SQLite storage. These files were subsequently retired by Plan 257:

1. Original Service execution freezes mixed create/external/update operations at positions 0/1/2. An injected pending-request insertion failure proves ServiceChain commits neither its original `outcome` nor its complete external invocation partially. ServiceVersionRepo retains its resources, checkpoint and complete pending output. Its actual original-command subscriber recovers that output without evaluating again and refuses a mismatched admitted payload.
2. Publication fails before history commit, then loses a reply after ServiceVersionChain commits. The complete local pending row survives both failures and actual Durable Object reconstruction. An unchanged retry through ServiceVersionRepo's native recovery alarm clears it only after successful `appendExecutionPackets`; ServiceVersionChain retains one immutable command. The actual original-command receiver recovers the same output from remote history after local publication deletion. Every submitted publication preserves the original timestamp, external ID and operation bodies.
3. ServiceVersionChain rejects changed timestamps and same-length operation-body changes even with the same disposition hash, rejects partial producer coordinates and rolls back a batch containing a later invalid hash. ServiceChain rejects a conflicting retained `outcome`; a schema-valid equal-outcome repeat remains a no-op after fixture removal of an already-delivered pending request, even if operation bodies/hash differ. No-op Success and declared Failure retain empty operations. SQL inspection proves the ten shared output columns, twelve admitted-input/outcome columns, primary/unique constraints and absent retired history tables. Current external pending storage has the six complete invocation fields approved by Plan 219, superseding this plan's historical eight-field preservation requirement.
4. Actual cold replay-subscriber catch-up pulls only the contiguous finalized prefix, leaving the admitted but unfinished next command alone. Existing-release recovery restores resources/checkpoint/complete pending output from remote ServiceVersionChain history with zero evaluations. A fresh parallel release evaluates once at the retained time, emits only model operations at sparse positions 0/2 and creates no new pending external request. Actor and Agent projection receivers each roll back resources, checkpoint and selected publication when publication insertion aborts; retry commits all three together at the retained `outcome.finalizedAt`, and repeated pages leave them unchanged.

`pnpm nx run zerospin:test` passes compiler checks and all 46 tests across eight files, including 21 Workerd cases and the Clock-scope case. System Worker lint passes with zero errors and the existing unrelated `prepareServiceProjectionOccurrence.ts` warning. Scoped formatting, whitespace and affected-document link checks pass. Independent source/test reviews found no production defect. Only existing authorized test/fixture files and documentation changed; all 84 tracked production TypeScript files in the affected execution/recovery/projection/queue modules match their pre-verification hashes. No existing storage reset, deployment, compatibility path, dependency or new test file was introduced.

**Preservation review:** The original temporary snapshot directory is empty, so equality to those particular uncommitted bytes cannot be established. Immutable Git comparison of cutover commit `ff3ef7b82e21d6be568e0ac2cdfd8c91a5fe1495` against parent `90604844c4998ea46d82e0354c8604e6382226c3` instead proves eighteen unaffected storage-definition/codec modules and the original eight-field Service pending-request block/index are byte-identical across the cutover. The same commit co-lands Plans 215/216; their fanout/subscriber changes remain attributed to them. Plan 219 later removes pending-request parent/index duplication in `ff1c4b34220320b25cc79c1e95e54ccf6f532e9e`. Later Agent/descriptor/capability changes belong to their own plans. This closes source-preservation review without claiming physical-database equivalence from source hashes.

**Proof boundary:** Successful ServiceVersionChain append returns void after durable retention; it is publication acknowledgement, not an echoed-input command-admission receipt. Projections skip already-applied positions; full-output duplicate equality belongs to ServiceVersionChain. Fixture activation fanout is omitted, and selected-Chain delivery is deliberately unavailable to observe pending projection rows. This result does not establish automatic activation enrollment, selected-Chain durable delivery, Actor authentication/private filtering, browser/socket behavior or actual external-request/continuation delivery. Those independent obligations remain with Plans 196/215/216/218/219/221 and related parent work. The transferred bounded Failure-retention and replay-time obligations from Plans 238/239 are complete.

## Replay-time verification — 2026-10-22

The then-existing `agent-runtime.spec.ts` and its `agentRuntimeConfig.ts`/`agentRuntimeWorker.ts` contained two focused cases; Plan 257 subsequently retired those files:

1. An authored fixture contract reads Effect wall milliseconds/nanoseconds, refuses at an expired reservation deadline and otherwise creates a resource through its declared operation. Production Service admission, `ServiceVersionRepo.materializeCommandTx` and `ServiceChain.recordOriginalCommandOutcomeTx` retain a Success before expiry. After actual Durable Object reconstruction, proved by changed incarnation identity and unchanged SQLite state, a new original at the expired deadline retains a declared Failure without changing resources. Fresh parallel release 2 replays both admitted commands using the outcomes read from durable ServiceChain storage. Its complete packets, resource contents and createdAt/updatedAt exactly match release 1, including the original Success's pre-expiry `outcome.finalizedAt`. Repeated replay leaves durable state unchanged. The same owner's actual `executeServiceQuery` reads current wall time before and after replay.
2. The production `withServiceEvaluationClock` receives an injected live Clock. Safe/unsafe wall milliseconds/nanoseconds stay frozen inside evaluation; monotonic readings advance, sleep delegates to that live Clock, and wall readings outside the scope reflect its advanced live time. This is delegation/scope proof, not an elapsed-real-time sleep test.

`pnpm nx run zerospin:test` passes compiler checks and all 42 tests across eight files, including 17 Workerd cases and the Clock-scope case. `pnpm nx run system-worker:lint` passes with zero errors and the existing unrelated `prepareServiceProjectionOccurrence.ts` warning. Scoped formatting, whitespace and affected-document link checks pass. Independent source/test review found no production defect. No production runtime/schema change, new file, class, binding, dependency or existing-storage reset was required; verification uses fresh disposable SQLite storage.

**Proof boundary:** Replay invokes the real materialization transaction with `retainedResult: null` on a fresh release. The fixture omits activation fanout; it does not exercise `replayCommand`'s remote pending/history selection, retained-output restoration, publication deletion or projection. Repeated replay proves unchanged durable state, without independently counting evaluations. External-request and alarm invocations remain source-reviewed outside the sole evaluation Clock scope; their runtime integrations were not rerun here. The reservation lease is an authored business deadline, not a producer/execution lease. The transferred replay-time repair and declared-Failure retention were scoped-complete in this first pass; the later recovery/publication/projection verification above completes the remaining Plan 214 obligations.

## Maintainer correction

The maintainer asked that this decision be included. The quoted final line describes the discussion before this plan was written:

> Yes. **Service should follow Aggregate and use one logical `outcome.finalizedAt`** for source resource writes, projection application and the retained outcome.
>
> Remove `executionStartedAt` and its plumbing. The current two sampling points reflect the implementation, not a requirement for two durable timestamps. My review should have challenged that distinction instead of preserving it.
>
> Combined with the ordered operations union, the proposed Service outbox becomes **ten columns**.
>
> No files changed.

The original review's recommendation to retain `executionStartedAt` is superseded by this decision. The pre-implementation source had twelve columns, separate operation arrays and two timestamp samples. The historical implementation outcome below records the replacement; completed verification is recorded above.

## Problem and agreed result

Service currently partitions one authored output sequence into two arrays with one shared delivery lifecycle, repeats parent context inside members and retains separate resource-application/finalization clocks. Store one ordered output union and use one logical evaluation timestamp throughout its resource changes and retained outcome.

1. `ServiceVersionRepo.serviceVersionChainOutbox` contains exactly ten columns: `serviceIndex`, `commandId`, `commandName`, `origin`, `nodeId`, `sessionName`, `pushIndex`, `outcome`, `dispositionChainHash`, `operations`. Preserve the `serviceIndex` primary key, unique canonical admitted `commandId`, required fields and existing all-null/all-present producer privacy. Remove physical `executionStartedAt` and `externalOperations`.
2. Rename ServiceVersionChain physical `executionHistory` and its schema/table property to `commands`. The shared Service output schema/shape, retained `commands`, `actorVersionRepoFanout`, original replies/recovery and projection delivery all use the ten-field representation. Remove ServiceChain `originalExecutions` entirely, matching AggregateChain; add nullable `commands.outcome` beside the eleven immutable admitted input/position fields. ServiceChain retains no complete original operation history or disposition hash. Complete output remains in pending ServiceVersionRepo publication and permanent ServiceVersionChain `commands`. These are required propagation, not additional Plan 151 table-purpose reviews.
3. `operations` is one ordered union of model mutations and frozen external descriptions. Every member retains its original nonnegative safe `operationIndex`. Original output preserves mixed authored order; replay omits external emissions before preparation/ID allocation and preserves sparse model positions. Failure has an empty union; no-op Success may also have an empty union.
4. Model members contain `{ operationIndex, modelName, modelVersion, resourceId, operationName, body }`. External members contain `{ operationName: 'external', operationIndex, externalContractName, externalContractVersion, payload, externalCommandId }`. Remove repeated model `commandId` and external `initiatingCommandId`, `origin`, `serviceVersion` from embedded output. Parent `commandId`/full `origin` and the bound execution release supply those facts at consumers. Retain exact model/contract versions, frozen portable bodies/payloads and stable external command IDs.
5. Sample one logical `finalizedAt` inside each new ServiceVersionRepo materialization transaction after authority/input/progress checks. Carry it through evaluation, source model application, Success or retained Failure construction and pending output. Set `outcome.finalizedAt` to that same sample. Service projection model application reads `command.outcome.finalizedAt`. Remove the second `new Date()` in finalization and every server-side `executionStartedAt` field/parameter/serialization/read. Replace the transaction context's `startedAt` carrier with `finalizedAt`; do not leave a second clock under a different name.
6. The logical timestamp follows the synchronous committed evaluation, not a separate start/finish audit. A recognized refusal uses the same sampled value after business-savepoint rollback. Infrastructure failure rolls back output/head/resources and retains no outcome. Duplicate original/replay recovery preserves the exact retained timestamp without sampling another one. Each receiving Service release evaluates replay locally at the retained original outcome.finalizedAt; its projections reuse that logical time. This follows the Plan 239 replay-time amendment above.
7. ServiceChain remains authoritative for admitted payload/contract/original-release input and retains only the first exact original `outcome`. New admitted commands have `outcome: null`. First receipt validates the bound original reply association and finalized predecessor, then sets outcome and inserts complete pending external requests atomically. A repeated receipt with equal retained outcome returns before request insertion; conflicting outcome fails. ServiceVersionRepo preserves full authoritative admitted-input validation before execution and after result recovery. ServiceChain alone executes external requests. Reconstruct complete standalone Service pending external rows at original receipt from parent output plus the pinned original execution release. Keep the existing eight-column `ServiceChain.externalOperationOutbox`, its unique ID and parent/index constraint unchanged. No parent lookup is needed to run/settle a pending request.
8. Preserve source/resource/history ownership, exact original-reply identity recovery, full immutable duplicate equality at ServiceVersionChain, release-local hash validation, synchronous commit boundaries, producer privacy, cold fixed-prefix catch-up, original/predecessor order, replay suppression of external work and acknowledgement-gated publication deletion. ServiceChain repeated receipts compare retained outcome, including `finalizedAt`, rather than operation bodies/hash; equal-outcome repeats cannot recreate pending work. Pending originals are `commands.outcome IS NULL`; replay reads only the contiguous non-null-outcome prefix directly from commands. Point reads need no output join or original-output reconstruction helper. `dispositionChainHash` still includes only previous hash, position, admitted command ID and `outcome.result._tag`; timestamp/operations changes do not alter its tuple.
9. Keep Service materialization-head and selected `exposedCommands`/`commandResolutions`/connection schemas unchanged. Selected resource deltas will carry the unified resource timestamp naturally. Aggregate and Agent storage remain outside this cutover. Independent client optimistic staging timestamps and `externalOutcome.recordedAt` retain their existing meanings.
10. Hard-cut superseded fixed schemas and callers: no compatibility aliases, dual arrays/clocks, migration, fallback decoder or retained legacy field. Affected fixed schemas include ServiceVersionRepo, ServiceVersionChain and ServiceChain original output; require empty affected storage and coherent dependent materializations under repository policy. This plan performs or authorizes no storage reset/deployment.

## Decisions and rationale

1. A complete pending publication is necessary until ServiceVersionChain commits it; one pointer or reconstructing output from later resources loses durable output needed for publication and duplicate recovery. Retain that responsibility.
2. One ordered union expresses the existing single commit/publication/acknowledgement/deletion lifecycle. Consumer filtering is sufficient. Keep authored indexes because replay creates gaps; array offsets cannot replace them. Require strict increasing mixed positions and unique external IDs instead of maintaining separate array order/collision checks.
3. Repeated parent context is derivable at the same trusted boundary and adds no independently variable fact. Preserve complete standalone mutation/request forms where their APIs require them by supplying that context locally. The evaluating release is the bound owner, which can differ from the admitted original release on replay; external members exist only on originals, where the versions coincide.
4. The two current sampling points demonstrate implementation behavior, not a requirement for two durable clocks. Follow Aggregate's one logical `outcome.finalizedAt`: source writes and projections apply identical recorded resource times, and retained outcomes/retries preserve the same value.
5. Follow Aggregate table semantics explicitly: ServiceVersionChain `executionHistory` becomes `commands`; ServiceChain `originalExecutions` is removed rather than renamed, and `commands.outcome` retains its original decision. Remove the old reconstruction helper and joins. Rename the outcome-recording procedure to `recordOriginalCommandOutcomeTx` as its responsibility changes. Keep the existing ten-field Service output representation and other method/type names; full admitted-command expansion and unrelated renames are separate work.
6. ServiceChain needs its original outcome to finish original delivery and expose finalized replay. Complete per-release output already has pending/publication history ownership. Retaining a second original-output table repeats that history without an independent lifecycle need. Full-output contradiction checks remain at ServiceVersionChain; exact input/outcome checks retain their distinct owners.

## Implementation sequence

1. Replace the shared Service operation schema with the compact ordered union. Remove `executionStartedAt` and `externalOperations` from its protocol and physical shape. Keep parent ID/name/Origin/producer/outcome/hash constraints and ten-field codecs. Reuse this single declaration for pending publication and ServiceVersionChain history/fanout; do not create a competing table codec.
2. Update ServiceVersionRepo's transaction context to sample/return `finalizedAt` once after accepted authority/progress validation. Have application and finalization consume it. Preserve mixed prepared output order while applying only model mutations and retaining compact union members. Remove obsolete timestamp/split-array arguments from materialization and result retention. Keep resources, head and full publication in the same synchronous transaction/savepoint structure.
3. Rename the ServiceVersionChain retained table/property to `commands` throughout declaration, append, result/checkpoint/page reads, fanout history reads and existing checks. Preserve permanently retained rows and subscriber behavior; add no alias/compatibility table. Update append validation for mixed variants, exact model/contract associations, authored index order, unique external IDs, Failure emptiness and retained producer privacy. Preserve whole-output duplicate equality and existing contiguous hash recomputation before atomic history/fanout retention. Queries/checkpoints/result recovery keep their current ownership.
4. Remove ServiceChain `originalExecutions`, `readOriginalExecution` and original-output joins. Add/decode nullable `commands.outcome`; seed it at admission and preserve immutable admission retries. Replace pending selection with null-outcome selection and read point/replay commands directly, retaining the contiguous finalized prefix. Replace `acknowledgeCommand` with `recordOriginalCommandOutcomeTx`: validate bound receipt index/ID/name/Origin/producer association and the existing original release authority, compare an existing outcome exactly before returning, enforce the retained-outcome predecessor and validate first-receipt union positions. Use parent context and validated original release to build complete eight-field pending external requests, then update outcome and insert requests in one synchronous transaction. Keep full admitted-input validation in ServiceVersionRepo outside SQL/permits. Repeated receipts after request deletion never recreate work; complete output recovery uses pending publication or ServiceVersionChain `commands`, with no Chain reconstruction/cache.
5. Update projection preparation/application to select only model union members, restore standalone parent ID where required and apply resource writes at `command.outcome.finalizedAt`. Preserve exact model binding, producer ownership, hash/continuity checks, selected delta and private resolution behavior. Never execute retained external descriptions from history/projections.
6. Update existing acceptance/Workerd assertions and fixtures in place for ten shared fields, the renamed SVC `commands` table, absent ServiceChain `originalExecutions`, nullable ServiceChain `commands.outcome`, one union and exact single timestamp behavior. Keep tests concise and reuse existing seams. Create no test files, fixture files, runners or configuration. Prepare these changes without running verification while the maintainer's deferral stands.
7. After implementation, reconcile affected module READMEs, glossary, local patterns and architecture clauses with actual behavior. Amend existing ADRs 015/016 in place for Service union/context/time and command-history/outcome-retention semantics; keep their remaining authority/resource/history rules and status. Update the finding, this plan and Plan 151 with actual implementation versus deferred checks. Do not rewrite historical review evidence as passing implementation verification. Plan 151's next table remains the retained ServiceVersionChain command table: currently `executionHistory`, planned `commands`. Its physical name changes only during implementation.
8. Keep this plan active through all deferred checks. Record actual results and archive this same filename with repaired links only once no required work remains. Plan 196 and Plans 211/212/213 retain their separate completion obligations.

## Planned file hierarchy

`+` creates; `~` modifies; `→` renames; `-` removes. The tree records the implementation scope; linked source review and planning evidence remain distinct from deferred implementation verification.

```text
zerospin/
  packages/system-worker/src/
    ServiceVersionRepo/
      ~ materializeCommandTx.ts
      ~ ServiceVersionRepo.ts
      ~ readCommandResult.ts
      ~ utils/readServiceOccurrenceTx.ts
      ~ utils/prepareServiceOutput.ts
      ~ utils/applyServiceOutputTx.ts
      ~ utils/finalizeServiceOccurrence.ts
      ~ utils/retainServiceResultTx.ts
      ~ README.md
    ServiceVersionChain/
      ~ serviceVersionChainDbConfig.ts
      ~ serviceExecutionPacket.ts
      ~ appendExecutionPacketsTx.ts
      ~ ServiceVersionChain.ts
      ~ README.md
    ServiceChain/
      ~ serviceChainDbConfig.ts
      ~ ServiceChain.ts
      ~ acknowledgeCommand.ts → recordOriginalCommandOutcomeTx.ts
      - readOriginalExecution.ts
      ~ readPendingServiceCommand.ts
      ~ readReplayCommandsPage.ts
      ~ readServiceCommandOccurrence.ts
      ~ admitServiceCommands/appendServiceCommand.ts
      ~ admitServiceCommands/readRetainedServiceCommand.ts
      ~ README.md
    serviceProjection/
      ~ prepareServiceProjectionOccurrence.ts
      ~ applyExecutionPacketsTx.ts
      ~ README.md
    ServiceActorVersionRepo/
      ~ README.md
    externalOperations/
      ~ README.md
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts
  wiki/
    ~ glossary.md
    plans/
      + 214-plan-service-ordered-operations-and-finalized-at.md
      ~ 151-plan-storage-table-review.md
      ~ 196-plan-service-chain-original-operations-and-external-work.md (subsequent cutover note)
    reviews/storage-tables/
      ~ service-version-repo-service-version-chain-outbox.md
      ~ service-version-repo-materialization-head.md (subsequent cutover note)
    adrs/
      ~ 015-service-delivery-history-and-projection-ownership.md
      ~ 016-aggregate-original-operations-and-external-work.md
    patterns/system-worker/
      ~ preserve-command-payloads-across-chains.ts
      ~ versioned-aggregate-actor-owned-projection.ts
      ~ repo-lifecycle.md
    architecture/
      ~ AuthoredSystem.md
      ~ server/admitServiceCommand.md
      ~ server/serviceExecution.md
```

## Original verification checklist — completed through the current seam

The historical `system-repo-activation.workerd.spec.ts` named below is no longer present. The completed current Workerd/SQLite cases above replace that removed runner. The eight-column pending-request requirement is superseded by Plan 219; external-provider and selected-recipient integration retain their separate ownership. The checklist below records the original requested checks, not remaining work.

1. Use the existing Workerd `system-repo-activation.workerd.spec.ts` scenarios. Assert exactly ten shared output columns under SVC `commands`, absence of SVC `executionHistory` and ServiceChain `originalExecutions`, twelve ServiceChain admitted-command columns including nullable `outcome`, no `executionStartedAt`/separate external array, intact primary/unique constraints and unchanged eight-column pending external requests. Cover pending/finalized/null-outcome prefix and direct point/replay reads. Retain original mixed-order, sparse replay, no-op/Failure, atomic rollback and exact duplicate checks.
2. Add the smallest meaningful assertions inside those existing scenarios proving that source-created/updated resource timestamps and projected resource timestamps equal the retained `outcome.finalizedAt`. Cover a representative Success, retained Failure timestamp and exact duplicate/lost-reply recovery before/after pending publication deletion. Prove recovery preserves external IDs and does not resample/evaluate or recreate pending work. Preserve original contract result/failure/privacy checks without cataloguing input permutations.
3. Verify source-to-publication-to-projection continuity/hash, authoritative admitted-input association and exact whole-output equality. At ServiceVersionChain, a changed timestamp or operation body must fail full-output duplicate equality even when the disposition hash matches. At ServiceChain, changed retained outcome/time fails; a schema-valid equal-outcome receipt with changed operation bodies/hash is a no-op after first retention, including after pending deletion. Assert no request resurrection or replacement of the original decision. Preserve existing external observation admission/recovery and declaration/version checks.
4. When deferral ends, inspect the current Nx graph and run one scoped graph for relevant source/Workerd TypeScript, lint and Workerd tests with required dependencies, then the existing acceptance script against the completed artifacts. Do not overlap graph builds or broaden into unrelated work. No Explorer verification is required or permitted.
5. Run scoped formatting/documentation/link/citation/whitespace checks and independent implementation review only when verification resumes. Compare unaffected Aggregate/Agent storage, Service heads/selected session tables and Service pending external storage with pre-change copies captured before implementation. Resolve failures and record actual evidence before archival.

## Historical implementation outcome — before verification

The shared Service output schema/shape now has ten columns and one `ServiceOperationSchema` union. Model members omit parent command ID; external members omit parent ID/Origin/release and retain stable external ID and authored index. ServiceVersionRepo traverses prepared output in authored order, applies model members and retains the compact mixed sequence. Replay still omits external emissions before preparation/ID allocation and preserves sparse indexes.

`readServiceOccurrenceTx` samples one `finalizedAt` after authority/progress/input validation. Source application and `finalizeServiceOccurrence` use that same value; finalization no longer samples another Date. Projection preparation checks mixed ordering, selects model members, supplies parent command ID to the standalone mutation API and applies writes with `command.outcome.finalizedAt`. The old execution-start column, second array and timestamp/array parameters are removed from publication and retention. Resource/savepoint, local head and complete pending-publication sequencing remains synchronous.

ServiceVersionChain declares and reads permanent `commands` instead of `executionHistory`, retaining whole-output immutable duplicate comparison, contiguous positions and disposition hash recomputation. Its append validates mixed operation positions, unique external IDs, model codecs and exact local external contract resolution through the existing `resolveWorkContract`. It stores complete commands and existing projection fanout together. Fanout membership/payload responsibilities are unchanged by this cutover.

ServiceChain stores nullable original `commands.outcome` and has no `originalExecutions` or reconstruction helper. Admission seeds null; original selection and finalized replay/point reads use commands directly. `recordOriginalCommandOutcomeTx` validates the available original reply association, exact retained outcome, predecessor and first-receipt positions, then atomically updates outcome and reconstructs complete pending external rows from compact members plus admitted parent authority/release. Equal-outcome repeats return before insertion, so changed operation bodies/hash do not recreate requests. Conflicting outcome/time fails. Full admitted-input association remains validated by ServiceVersionRepo, and full-output contradiction checks remain ServiceVersionChain-owned. The standalone Service pending table retains eight fields and its constraints.

The two existing acceptance/Workerd files are updated for ten-field output, renamed/removed tables, nullable outcomes, ordered compact variants, source/projection timestamp equality and distinct Chain versus VersionChain duplicate rules. Sparse-index, stable-ID, rollback, cold/lost-reply recovery, refusal and privacy scenarios remain prepared but unrun. No new test file, fixture file, runner or configuration was created.

ADRs 015/016, affected module READMEs, glossary, local guidance, architecture clauses, the finding and Plan 151 describe the implemented responsibilities and explicit verification deferral. Plan 196 records this subsequent amendment without claiming its earlier deferred checks passed. Plan 151's next physical table is now ServiceVersionChain `commands`, the renamed retained-history occurrence still awaiting its own review. Its fixed inventory is 14 classes/49 owner-table occurrences after removing one table; this is an implementation inventory update, not another table-purpose review.

Pre-change storage/schema snapshots were captured under `/tmp/zerospin-plan214-before` for later comparison. Aggregate/Agent storage, Service head/selected session storage and standalone pending Service requests were left outside the intended schema cutover; preservation comparisons remain deferred. No typecheck, lint, tests, builds, acceptance, formatting, whitespace/link/range validation, preservation comparison or independent implementation verification ran. No storage reset or deployment was performed.

## Remaining work

None. Implementation, required scoped runtime/compiler/lint checks, documentation/link checks, independent review and the qualified Git preservation audit are complete. Plans 196/211/212/213/215/216/218/219/221 and parent Plan 151 retain their independent obligations; this completion does not close or authorize those checks, a storage reset or deployment.
