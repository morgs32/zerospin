# Six-column Service external-operation outbox

**Date:** 2026-10-16

**Status:** Complete. Implementation and required scoped verification completed under Plan 151 on 2026-10-22; archived with the parent review still active.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [ServiceChain.externalOperationOutbox](../../reviews/storage-tables/service-chain-external-operation-outbox.md). **Architecture:** [ADR 015](../../adrs/015-service-delivery-history-and-projection-ownership.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md) and the applicable [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md) amendment. Preserve unrelated work and completed Plans 217/218's verified changes.

## Problem and agreed behavior

ServiceChain's pending external-request table repeats parent lineage that neither request execution nor settlement reads. Its original-outcome transaction already prevents request recreation after pending deletion. Retain complete independently executable invocations and leave authored order with retained history.

1. Replace the eight-column `externalOperationOutbox` with exactly six required columns: unique `externalCommandId`, `externalContractName`, `externalContractVersion`, complete frozen JSON `payload`, full `origin` and original `serviceVersion`. Remove `initiatingCommandId`, `operationIndex` and the `initiating_command_operation` composite unique index. Keep the existing formatted command-ID descriptor/uniqueness; add no key, index, counter, timestamp, status or pointer.
2. At original receipt, explicitly select the four external invocation members and restore full Origin/original Service release from the retained admitted command. Do not spread the whole external operation into the narrower row or retain an unused pending-row compatibility shape.
3. Preserve complete output decoding, exact admitted-command/provenance matching, finalized predecessor, Failure-without-operations, safe strictly increasing authored operation positions, atomic first `commands.outcome`/request insertion and exact retained-outcome early return before insertion. Equal original retries must not recreate requests after settlement; conflicting outcomes still fail.
4. Preserve `operationIndex` and parent context in shared preparation and ServiceVersionChain's ordered operations/history. Replay continues to remove external emissions before preparation/ID allocation without renumbering remaining model positions. Do not change `ServiceExternalOperationSchema`, the shared history union or retained history storage to fit pending delivery.
5. Keep exact release/contract/payload resolution, stable external-ID reservations, independent request execution, timeout/response observation and alarm completion-hook recovery. Settlement still re-reads the six-field row, admits its stable-ID external command with exact version/Origin and all-null producer tuple, then deletes pending work in one synchronous transaction. Missing work is a no-op. Deletion proves observation admission, not continuation execution or retained continuation outcome.
6. The existing table-owned codec automatically supplies the six-field queue/settlement representation. The shared queue already requires only invocation fields; add no generic queue variant, callback or parallel decoder. Keep complete Origin/release in the row rather than introducing a parent query/assembly path. Keep authored provider idempotency responsibility unchanged.
7. Keep Aggregate physical storage and implementation unchanged, along with Actor/Agent and other Service schemas. This is a hard cutover requiring empty affected ServiceChain storage, without migrations, aliases, fallback decoders, dual paths or automatic reset. Perform no reset, deployment or commit.

## Decisions and rationale

1. Pending parent/index uniqueness is redundant with first-receipt ordered-output validation and the atomic retained-outcome guard. Keep external-ID uniqueness because settlement requires one pending invocation for each future admitted command ID.
2. Parent identity/positions remain history facts. Complete frozen payload, Origin and exact emitting release remain invocation facts even though a retained parent could technically supply some of them. A pointer alternative adds lookup/codec/missing-parent assembly responsibilities to the live queue without a consumer requirement.
3. Amend existing governing ADR clauses and directly affected READMEs/glossary/patterns. No new domain term or ADR is needed; this is the approved Service representation amendment to the existing architecture.

## Implementation sequence

1. Remove the two pending fields/composite index from the ServiceChain schema; explicitly construct six-field pending rows in the existing original receipt transaction.
2. Reuse existing queue/settlement codecs and all recovery/transaction boundaries. Update actual in-scope consumers and existing assertions that construct/inspect Service pending rows, preserving original shared preparation/history facts and all Aggregate assertions.
3. Update existing assertions in place for exact six-column/ID uniqueness/no lineage index, retained operation positions, first original outcome/request atomicity, equal original retry after settlement and exact continuation data. Reuse the current seams and add no tests, fixtures, runners or configuration files. Run no verification during deferral.
4. Reconcile ADRs 013/015/016, affected module READMEs, glossary and local patterns. Record the implementation in the finding and Plan 151 without reviewing another table; next remains ServiceChain.replaySubscribers.
5. Record actual outcome and all deferred checks. Keep the plan active until verification is authorized and passes; archive only then.

## Planned file hierarchy

`+` creates; `~` modifies. Preserve all existing working-tree changes.

```text
zerospin/
  packages/core/src/contracts/
    ~ README.md
  packages/system-worker/src/
    ServiceChain/
      ~ serviceChainDbConfig.ts
      ~ recordOriginalCommandOutcomeTx.ts
      ~ README.md
    externalOperations/
      ~ README.md
  wiki/
    ~ glossary.md
    adrs/
      ~ 013-aggregate-delivery-history-and-projection-ownership.md
      ~ 015-service-delivery-history-and-projection-ownership.md
      ~ 016-aggregate-original-operations-and-external-work.md
    patterns/system-worker/
      ~ preserve-command-payloads-across-chains.ts
      ~ repo-lifecycle.md
    plans/
      + 219-plan-service-external-operation-outbox.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ service-chain-external-operation-outbox.md
```

## Verification seams

1. Existing Service request assertions should establish six required fields, preserved unique external identity and removed lineage index; exact frozen payload/Origin/release; sparse positions retained in ServiceVersionChain history; original outcome/request atomic rollback; retained-outcome idempotence after request deletion; and atomic observation-command admission/deletion with late callbacks as no-ops. Reuse existing independent-request/recovery/timeout behavior rather than adding a new harness.
2. The maintainer ended deferral on 2026-10-22. Inspect current Nx configuration and run the scoped system-worker/source and Workerd type/lint/test graph with required dependencies and existing acceptance checks. The former acceptance runner/Workerd tree is removed; extend the existing authorized SQL and Workerd files without introducing test, fixture, runner or configuration files. Do not claim execution of retired infrastructure. No Explorer verification is required or permitted. Keep other active plans' obligations separate.
3. Formatting/documentation/link/citation/whitespace checks, independent implementation review and Aggregate/other source-preservation comparisons are now required too. Resolve in-scope failures, record actual evidence and archive only after required checks pass.

## Implementation outcome

ServiceChain's fixed `externalOperationOutbox` now declares exactly six required invocation fields: unique formatted `externalCommandId`, external contract name/version, frozen JSON payload, full Origin and original Service release. Pending `initiatingCommandId`, pending `operationIndex` and the composite `initiating_command_operation` index are removed. No new field, key/index or parallel row representation is added.

`recordOriginalCommandOutcomeTx` explicitly extracts the four external invocation members and restores Origin/serviceVersion from the retained admitted command. It no longer spreads history-only fields into the pending row. The existing complete-output/identity validation, predecessor/Failure/order checks, atomic first outcome/request transaction and retained-outcome early return remain in source. The table-owned codec supplies the narrowed queue/settlement representation; no shared queue or settlement runtime edit is required.

Shared prepared descriptions and ServiceVersionChain's operations union/history retain parent context and sparse authored operationIndex. Preparation/replay suppression, stable ID allocation/recovery, declaration/payload resolution, request reservations, completion/alarm recovery and atomic external observation admission/request deletion are outside the production edits. Aggregate schema/implementation and other storage declarations were not edited; preservation comparisons remain deferred.

The original implementation updated acceptance assertions in the then-existing runner. That runner and Workerd tree were later removed. This follow-up extends the current authorized SQL and Workerd files in place; it creates no test, fixture, runner or configuration files and does not report deleted infrastructure as executed.

ADRs 013/015/016, ServiceChain/external-operations/contracts READMEs, glossary and local preservation/lifecycle patterns describe complete pending invocations separately from retained operation history. The source refresh corrects obsolete Service Origin wording: current Service commands support Actor, Agent and System Origin. No new domain term, pattern or ADR is required; one existing local Origin sentence and its index routing are corrected in place. Other active plans retain their own status; parent Plan 151 remains active.

## Verification — 2026-10-22

1. Three Effect-native cases extend existing [repo-names.spec.ts](../../../packages/system-worker/tests/repo-names.spec.ts). SQLite PRAGMAs establish exactly six required columns, no primary key and only the unique external-command-ID index. Actual ordinary Actor admission and canonical external preparation supply full frozen payload/Origin/release and sparse positions 2/7. Duplicate pending IDs roll back both the first original outcome and all pending insertions. After real observation settlement, an unchanged original receipt creates no request; a conflicting outcome is refused.
2. The same SQL seam verifies observation-command insertion and pending deletion as one transaction, including independent INSERT and DELETE aborts. Successful Success/Failure observations retain the exact stable ID, contract/release/payload/full Actor Origin and null producer tuple with command `outcome: null`. Later differing callbacks are no-ops. A canonical-ID conflict preserves the existing admitted command and pending invocation. SQLite query defects are captured with Effect.exit; the test does not assume all transaction defects become a typed error.
3. Three cases extend existing [agent-runtime.spec.ts](../../../packages/system-worker/tests/agent-runtime.spec.ts), [Worker](../../../packages/system-worker/tests/support/agentRuntimeWorker.ts) and [declarations](../../../packages/system-worker/tests/support/agentRuntimeConfig.ts). The actual empty-original `executeCommandOutbox.drain()` invokes its completion-recovery hook and launches the real external queue. A finalizer-gated request cannot overlap across repeated wakes, while a second release's request settles independently. Distinguishable version-1/version-2 declarations prove exact release binding and JSON-null/object Success responses. The admitted observation remains `outcome: null` while fixture continuation delivery refuses.
4. Reconstruction changes ServiceChain's incarnation while its original request finalizer is held, before observation admission; pending bytes survive. A SQL deletion fault is installed only after the new incarnation passes its real fixed-schema gate. The native-alarm pass is captured, its provider finalizer released and all registered background work awaited before asserting unchanged commands/pending rows. Removing that fault allows the identical frozen payload/ID/release to settle once. Retrying both retained parent packets creates neither pending work nor another provider call. The same provider callback can run again before local observation commit; this does not claim exactly-once remote effects.
5. Declared request refusal, an unusable non-JSON response and actual timeout each become the existing external Failure observation. Timeout waits for its gated finalizer; repeated wakes cannot start a second attempt while that finalizer is held. Other requests settle independently. Missing exact release, a contract version available only in another release and a malformed contract payload preserve pending work/alarm without provider invocation or a Failure observation. Each negative assertion awaits the background work started during that native alarm. Restoring the frozen invocation then recovers through version 1 without newer-code fallback.
6. Completed Plan 214's passing retained-history/replay cases continue to prove immutable ServiceVersionChain output and sparse retained positions; the new SQL positions are prepared inputs, not a replacement history proof. The new source packets are trusted fixture finalizations, and the actual empty-drain completion hook substitutes for a commit-before-hook interruption. Native alarm methods are manually dispatched after consuming the stored alarm; automatic activation/enrollment and autonomous scheduler timing are not established. The fixture substitutes SystemRepo registration and deliberately pauses continuation execution. It does not prove acceptance of changed immutable definitions, authentication/tickets, real provider network integration or continuation execution/outcome retention. The opt-in background barrier covers work registered during that pass, not retroactively older in-flight requests. Constant fixture time avoids confusing a captured Date.now function with later function replacement.

The complete scoped Nx compiler/library graph and **72 tests across eight files pass**, including the six new cases and retained Plan 214–218 checks. System Worker lint passes with zero errors and the one existing unrelated curly warning at `prepareServiceProjectionOccurrence.ts:68`; newly authored curly warnings were corrected. Scoped formatting, local links/source-citation ranges, whitespace and independent review pass. No production defect was identified. Nx Cloud artifact reporting was unavailable (401/DNS); local Nx tasks completed successfully. Initial fixture constructor/clock/error-capture assumptions were corrected, and the real schema gate correctly refused a test trigger carried across reconstruction; the final case injects that trigger only after initialization.

All 396 pre-existing System Worker TypeScript modules and five current core external-execution/Origin modules remain byte-identical to the turn baseline. Qualified historical comparison of `ff1c4b34220320b25cc79c1e95e54ccf6f532e9e` and parent `ff3ef7b82e21d6be568e0ac2cdfd8c91a5fe1495` preserves 118 grouped modules: 27 AggregateChain, seven shared externalOperations, five ServiceVersionChain, 28 ServiceVersionRepo and 51 Aggregate Actor/Agent/shared modules. ServiceChain's class/settlement and the two Service projection schemas are also identical. Plan 219 changes only the Service pending declaration and receipt projection; co-landed Plans 218/220–222 remain separate. Later core helpers and Agent Node stores are covered by the current baseline. These are source comparisons, not physical-database equivalence.

No existing storage is reset; no runtime/schema change, compatibility path, dependency change, deployment or commit is made by this verification follow-up. Parent Plan 151 and other active plans stay open.

## Remaining work

None.
