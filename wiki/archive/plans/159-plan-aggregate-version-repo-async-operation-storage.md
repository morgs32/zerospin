# AggregateVersionRepo async operation storage

**Date:** 2026-10-15

**Status:** Complete. Implementation, scoped verification, documentation and independent review finished on 2026-10-15.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md).

**Evidence:** [AggregateVersionRepo.asyncOperations review](../../reviews/storage-tables/aggregate-version-repo-async-operations.md).

## Problem and intended result

Aggregate external-work rows repeat their containing instance and initiating command position, retain an unused execution-start timestamp named `committedAt`, and use ambiguous initiating/continuation command names.

Keep independent frozen work and its first observation. Retain parent lineage explicitly while reducing the aggregate row from eleven fields to eight. Preserve the original-only request and recorded-continuation boundary from [ADR 012](../../adrs/012-opaque-external-work-and-originating-chain-continuations.md) and [Plan 152](152-plan-aggregate-chain-command-storage.md).

## Settled model

Retain the physical table name `asyncOperations` with:

```ts
{
  initiatingCommandId: string;
  operationIndex: number;
  externalContractName: string;
  externalContractVersion: string;
  payload: Json;
  continuationCommandId: string;
  origin: Origin;
  externalOutcome: ExternalOutcome | null;
}
```

The sketch denotes existing JSON, Origin and outcome schema types, not new type aliases. All fields except the first recorded `externalOutcome` are immutable.

1. Rename `commandId` to `initiatingCommandId`. Retain its unique pairing with `operationIndex` as durable lineage and one invocation per authored parent output slot. This is not the identity used to reserve or retry the external request.
2. Keep `operationIndex` as the original zero-based position among all emitted operations. External positions can be sparse; do not renumber them after excluding model output or replayed work.
3. Rename `asyncContractName`/`asyncContractVersion` to `externalContractName`/`externalContractVersion`. Retain the exact canonical external declaration identity, not a latest-version lookup.
4. Rename `asyncCommandId` to `continuationCommandId`. Preserve its uniqueness and stable `cmd_…` identity for pending request lookup, live reservation, first-observation recording, delivery references and prepared-child proof. Add no independent work ID, SQL foreign-key relationship or new primary key.
5. Remove `aggregateId`; the physical owner supplies `{ systemId, aggregateId, aggregateName, aggregateVersion }`. Preserve bound-owner checks and complete-child proof at their actual boundaries.
6. Remove `aggregateIndex` and async `committedAt`, without substitute fields. The former is unused second parent-position metadata; the latter stores execution start time, not commit time, and has no async control reader. Preserve model-operation positions and timestamps wherever independently used.
7. Keep frozen contract-encoded `payload`, complete `origin` and the existing structured `externalOutcome`. Recorded reconstruction remains independent of the initiating command and live external declaration. Both outcome branches remain deliverable; successful JSON null stays explicit.

## Required propagation

- **Shared declaration and indexes:** cut `asyncOperationsDbConfig` to the eight fields. Its current `operationKeyIndex` also defines both model-operation indexes: split the async-specific `(initiatingCommandId, operationIndex)` index from model `(commandId, operationIndex)` indexes. Preserve model rows, output encoding/history, disposition hashing and timestamps. Keep no compatibility alias for the old async index fields.
- **Aggregate composition:** remove the now-redundant aggregate-only table override and lifecycle codec instead of retaining a wrapper over the same shared shape. Delete async owner-column writes and row/key comparisons; retain owner acquisition/validation and key-derived transport identity.
- **Shared service consumers:** propagate renamed shared fields and removal of shared async `committedAt` through ServiceVersionRepo. Preserve its narrower service Origin codec and existing `serviceIndex` override pending its own review. The resulting service row has nine fields; this propagation does not approve or remove its owner-specific ninth field.
- **Preparation and output:** update the production input, both external operation descriptor codecs, both preparation/output procedures and async insertion branches. Remove only async timestamp/aggregate metadata. Keep the public `.asyncOperation` scheduling capability and authored `'async'` discriminator; this is not a blanket rename of async modules/APIs.
- **Runner and recording:** update exact declaration resolution, frozen input validation, pending scans, live reservations and observation recording. Keep every operational lookup keyed by `continuationCommandId`; using the initiating ID would collapse multiple requests emitted by one parent.
- **Prepared-child proof:** rename the ambiguous child argument `getPreparedAsyncCommand({ commandId })` to `{ continuationCommandId }` across both concrete RPCs, procedures, readers, proof callers and outbox preparation. The reconstructed command still has ordinary envelope `id: work.continuationCommandId`.
- **Outbox reference:** rename `asyncCommandOutbox.asyncCommandId` to `continuationCommandId` as required reference propagation, including inserts/decoders/readers. Keep its current queue index, head allocation, alarm name and diagnostic policy in this child. The outbox has its own recorded review; any further changes require its separately selected scope.
- **Documentation and schema consumers:** reconcile affected module READMEs, glossary/architecture/patterns, descriptor and Origin consumer documentation, Explorer purposes/capture and existing verification. An existing inspection assertion sorts async rows by removed `aggregateIndex`; use retained parent lineage for that assertion rather than inventing another cursor.

## Transaction and recovery requirements

1. Only original command execution freezes async work. Exact canonical registration and portable encoding complete before business output applies. Resource changes, work rows and original command outcome/progress remain atomic; rollback cannot leave orphaned external work. Replay discards async descriptions before preparation.
2. Arm durable recovery before the original execution callback. Requests start after commit and outside execution permits/SQL transactions. Keep one live reservation per continuation ID through finalizer, recording and cleanup settlement; recheck durable pending state before invocation.
3. Resolve pending work in its containing release using exact frozen external identity and input. Definition/input-resolution failures remain recoverable operational failures. Preserve timeout/authored retry behavior and the distinction between unrecorded process loss and captured request failure, defect or interruption.
4. First outcome recording, outbox insertion and head advance remain one synchronous transaction. First committed observation wins; recording failure rolls back and preserves producer/recording Causes. Both Success and Failure observations enqueue the same stable continuation identity.
5. Reconstruct the complete child from frozen evidence plus the owner key, with an all-null producer tuple. Preserve exact originating-release proof before fresh Chain retention, exact retained retries, private authority, and independent continuation execution/replay. Recorded external work must not rerun after delivery failure.
6. Preserve pending-work/outbox alarm recovery, independent blocked-request/delivery progress and retained evidence after acknowledgement. Process loss before recording can repeat an external effect; neither parent uniqueness nor continuation identity establishes provider exactly-once behavior.

## Verification and completion

Use permitted existing scoped Nx checks, acceptance/profile and Workerd seams. Create no new tests, fixtures, runners or configuration.

Required evidence covers the exact eight-field aggregate declaration and nine-field service propagation; parent-slot uniqueness and sparse authored indexes; multiple stable continuations from one parent; preserved model indexes/timestamps/output; exact payload/Origin/contract reconstruction; original-only emission and rollback; both outcomes and JSON null; first-observation immutability; request versus recording failure/interruption; atomic enqueue; lost-ack exact-child recovery; and pending/alarm recovery without the removed fields.

Changed fixed schemas require empty affected storage. Refuse superseded shapes; add no aliases, fallback decoders, translation migration, compatibility-only fixtures or automatic reset. This plan authorizes no storage reset.

Reconcile docs/schema consumers and obtain independent identity, authority and recovery review. Report missing existing verification evidence as unfinished work. Archive this child only after implementation, required checks and review finish; the parent table review remains active.

## Implementation outcome

- AggregateVersionRepo uses the shared eight-field `asyncOperations` declaration directly. The aggregate-only override and lifecycle codec, async owner/parent-position columns and execution-start timestamp are removed. ServiceVersionRepo retains the shared fields plus its existing `serviceIndex` and narrower actor/System Origin codec.
- Async parent-slot uniqueness uses `(initiatingCommandId, operationIndex)`. Model-operation indexes remain `(commandId, operationIndex)` with their existing positions, timestamps, output encoding and history. External descriptor codecs use the exact frozen external contract names and versions; public scheduling capabilities and the authored `async` discriminator remain intact.
- Pending scans, live reservations, first-observation recording, outbox references, prepared-child readers and both concrete RPCs use `continuationCommandId`. Original-only emission, business savepoints, atomic first observation/enqueue/head advance, complete-child authority proof and independent request/delivery recovery retain their boundaries.
- Current module READMEs, glossary, contract/Origin guidance, architecture citations and Explorer descriptions/capture are reconciled. Explorer captures nine concrete Repo schemas and fifty tables, including exactly eight aggregate and nine service async columns.

## Verification evidence

- Completed existing scoped Nx compilation, typechecking and lint checks with `pnpm nx run-many --targets=lib,ts,lint,test-workerd-ts,check --projects=@zerospin/core,system-worker,@zerospin/browser,explorer,shopping --parallel=1 --outputStyle=static`. All compilation/typechecking/lint tasks passed. The initial Explorer check found an unformatted regenerated capture; formatting was repaired and its check passed below. Existing unrelated lint warnings remain.
- Passed `pnpm nx run-many --targets=check,build --projects=explorer --parallel=1 --outputStyle=static` (seven tasks including dependencies). An intermediate dependency build encountered TS2345 in concurrently edited, unrelated `makeInMemorySQLite3.ts`; its owner corrected it and the rerun passed. This implementation did not modify that file. Nx Cloud emitted an access warning after successful local checks.
- Passed `pnpm nx run system-worker:test-workerd -- test/migratable-do-repo/system-repo-activation.workerd.spec.ts test/telemetry/invocation-order.workerd.spec.ts` (two files, eight tests). Shopping inspection now joins retained initiating-command lineage for ordering, and its quotation/payment continuations use the renamed fields. Existing activation/cold-restart and failure/alarm recovery seams pass.
- Passed `node scripts/verify-plan140.mjs` (eight groups). Existing seams now prove the exact eight/nine-field layouts, separate parent/model indexes, sparse external positions `[1, 3]` and model positions `[0, 2]`, two distinct stable continuations from one parent, both uniqueness constraints, preserved model timestamps/output and rollback of resource/history/work rows after a late write failure. They also cover exact encoded payload/declaration/Origin reconstruction without an initiating journal row, original-only emission, both outcome branches and JSON null, immutable first observations, atomic enqueue/head rollback, combined producer/recording Causes, lost-ack exact-child recovery, and reservation/finalizer/timeout/interruption/alarm recovery.
- Independent production reviews found no actionable identity, authority or recovery defects. The primary agent also reviewed the shared runner and verification propagation. Scoped formatting, schema-capture assertions and `git diff --check` passed. No test files, fixtures, runners or configuration were created.

Changed affected fixed storage requires empty storage. No compatibility alias, fallback decoder, translation migration, automatic reset or existing application storage reset was introduced or performed. Concurrent SQLite/native/Swift work and unrelated plans were preserved. The parent table review remains active.

## Remaining work

None.
