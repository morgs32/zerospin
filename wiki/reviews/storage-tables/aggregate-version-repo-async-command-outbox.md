# AggregateVersionRepo.asyncCommandOutbox

**Reviewed:** 2026-10-15

**Status:** Historical review of the former two-column `asyncCommandOutbox`, implemented in Plan 186. Plan 190 replaced it with complete `externalCommandOutbox` messages; its independently deletable payload is deliberate. The former pointer-only recommendation is superseded and does not review the replacement.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

**Recalibration (2026-10-15):** The body below describes the earlier pointer outbox. Current `externalCommandOutbox` stores its own complete message; [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md) governs its retention/deletion.

**Implementation subplan:** [Plan 186](../../archive/plans/186-plan-aggregate-version-repo-async-command-outbox.md).

**Related approved work:** [Plan 159 — async operation storage](../../archive/plans/159-plan-aggregate-version-repo-async-operation-storage.md) already includes the required `asyncCommandId` → `continuationCommandId` reference rename. It does not select this table's diagnostic or ordering policy.

The original source review below predates Plan 159's reference rename and Plan 186's diagnostic removal. Its three-column descriptions and diagnostic failure analysis are historical evidence. Current implementation and verification are recorded in the linked archived Plan 186.

## Verdict and concrete owner

One row means: this recorded continuation still awaits admission to the originating AggregateChain. It does not mean the external request is pending or the continuation's authored program is unfinished.

The containing VersionRepo owns `{ systemId, aggregateId, aggregateName, aggregateVersion }`. It includes this shared table unchanged. The sole delivery receiver is the originating Chain derived from that key, so no per-row destination, owner, payload, Origin or outcome copy is needed. Full continuation input is reconstructed from the retained work row. [Composition](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts), [concrete delivery](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L125-L162).

There are exactly **three declared columns** and no synthesized application ID. Row existence is pending membership; successful admission removes the row while the work and first external observation remain retained.

## Every column

| Column                | Actual purpose and lifecycle                                                                                                                                                         | Disposition                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `outboxIndex`         | Nonnullable integer primary key allocated when the first external observation records. Orders delivery pages and identifies selected rows for deletion. Immutable until deletion.    | Retain for the current FIFO enqueue protocol. This is transport order, not an aggregate/operation/admission position or acknowledged cursor. |
| `asyncCommandId`      | Nonnullable unique stable continuation ID. Preparation uses it to load frozen work and reconstruct the child. Immutable until deletion.                                              | Retain as `continuationCommandId`, already selected in Plan 159. Add no separate work ID or full command copy.                               |
| `lastDeliveryFailure` | Nullable public JSON diagnostic, initialized null and overwritten for selected rows after a qualifying failed page. Never read to select, order or retry work. Deleted with the row. | Remove in favor of failure logging and future alerts. It provides optional inspection, not a delivery guarantee.                             |

[Declaration](../../../packages/system-worker/src/externalOperations/externalOperationsDbConfig.ts#L39-L50), [atomic enqueue](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts#L28-L90), [default selection/diagnostic/acknowledgement](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts).

`asyncCommandId` uses a branded-text descriptor with uniqueness; it does not declare a SQL `REFERENCES` constraint. The runtime validates that its retained work exists and has a recorded outcome before building the child. [Primitive mapping](../../../packages/shapes/src/primitiveMaps.ts), [prepared-work lookup](../../../packages/system-worker/src/externalOperations/readPreparedExternalCommand.ts).

## Why the index differs from the initiating command's position

The allocator advances a retained head when recording the observation, in the same transaction as outcome and outbox insertion. Thus `outboxIndex` describes local observation-recording/enqueue order. Multiple requests can come from one initiating command, and requests finish concurrently, so neither initiating `aggregateIndex` nor authored `operationIndex` substitutes for it. It is not a timestamp or a promise about provider-effect order.

The queue reads increasing positions, up to 64 rows per page, and can restrict reads to a numeric `throughIndex`. The retained allocator prevents position reuse after the queue empties. Acknowledged rows are deleted; there is no persisted acknowledgement frontier in this table. A naming rule for `acknowledged*` cursors therefore does not apply to this enqueue index. The head's own columns are the next separate review. [Recording/allocation](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts), [page selection](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts).

The async owner calls `drain()` without a numeric boundary, but the maintainer selected retaining FIFO enqueue order and its numeric protocol. There is no demonstrated stale-delete bug in the current serialized drain; preserve the chosen allocation/ordering semantics without inventing one as justification.

## What acknowledgement actually means

The sender reconstructs the full recorded child and calls `AggregateChain.admitAsyncCommands`. The receiving Chain proves each complete child against its original VersionRepo, then transactionally recovers exact IDs or admits the whole page and arms original execution recovery. Fresh admission failure rolls back the new page entries. [Complete-child proof](../../../packages/system-worker/src/externalOperations/verifyExternalCommandDeliveries.ts), [receiving method](../../../packages/system-worker/src/AggregateChain/admitExternalCommands/admitExternalCommands.ts), [admission transaction](../../../packages/system-worker/src/AggregateChain/admitExternalCommands/admitRecordedAggregateCommandsTx.ts).

Default sender acknowledgement deletes the selected rows after a successful RPC envelope. This owner supplies no custom acknowledgement callback and does not inspect the returned admission receipts' count, IDs or assigned positions. The actual receiving method guarantees atomic admission before success, so successful return serves as the acknowledgement. No defect follows solely from ignoring unused receipt metadata. Do not claim the sender performs receipt comparisons it does not perform. [Core success/ack path](../../../packages/core/src/outbox/makeOutboxDelivery.ts), [default deletion](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts).

This acknowledgement proves retained continuation input, **not authored continuation execution or success**. Later business refusal is a command outcome owned by the Chain/VersionRepo, not a reason to recreate this delivery row or repeat external work. If admission commits but its reply is lost, the row remains and exact-child redelivery recovers the admitted command. A separate pending-delivery row is useful because its lifetime differs from immutable work/observation evidence; merging the tables would require a new delivery-state representation rather than remove that fact.

## Diagnostic meaning and failure surface

`lastDeliveryFailure` contains the existing `PublicFailureSchema` fields: `_tag: 'ZerospinError'` is its public classification; `code` identifies the failure; optional `scope` identifies contract/actor/aggregate classification; `message` is the public description; `status` is a number or null; `extra` contains JSON details. These are diagnostic contents, not retry instructions, provider outcomes or pending state. [Schema](../../../packages/error/src/matchZerospinErrorCode.ts#L27-L36).

The name overstates its coverage. Only a sole typed failure reaches the diagnostic writer. Defects, interruption, compound Causes and transient transport attempts followed by success need not update it. A failed page writes the same diagnostic to every selected row without proving which child caused the failure. No timestamp or attempt history is retained. [Failure classification](../../../packages/core/src/outbox/makeOutboxDelivery.ts), [page-wide diagnostic update](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts).

There is also an unnecessary failure dependency: the failure finisher awaits diagnostic persistence before rethrowing the original delivery Cause. If that write fails, it can replace the original failure with a diagnostic-write failure. This follows from the current source sequence; it was not fault-injected here.

**Selected design:** remove this column and writer, preserving original failure reporting and pending membership. Future log alerts are separate work. Current default `makeOutboxQueue` requires the diagnostic column and always installs its writer, although its custom-storage/core paths already permit omission. Plan 186 removes the default-path requirement/writer because its only production callers are the two shared continuation outboxes. Add no flag, fake column, no-op writer or copied delivery loop. Preserve custom-storage owners' diagnostic policies pending their own reviews.

## Retry, interruption and recovery

1. First external observation, outbox insertion and retained head advance share one synchronous transaction. An already-recorded observation returns without creating another entry; both Success and Failure observations schedule the same stable continuation ID.
2. Drain serializes pages with a semaphore. Preparation reads durable work, delivery performs no SQL transaction across RPC, and default acknowledgement deletes the selected page transactionally. This is one ordered lane: a preparation/admission failure blocks that page and later delivery until recovery; it is not independent per-recipient fanout.
3. Only narrowly identified thrown retryable transport failures receive the immediate standard retry schedule. Encoded Chain refusals, defects and interruption retain pending work for later recovery. An eligible diagnostic may be written, but no failure value gates retry. [Core delivery/retry](../../../packages/core/src/outbox/makeOutboxDelivery.ts).
4. A failed/interrupted delivery before local acknowledgement retains its pending row. Lost replies use exact-child recovery. Once local deletion commits, no external request repeats merely because its authored continuation later fails.
5. Queue drain holds its recovery alarm before delivery and releases it only after pending work empties. The async-work lifecycle independently holds recovery while precommit callbacks, unrecorded work or pending deliveries remain; cold activation reestablishes that hold and starts delivery independently of blocked producers. Keep durable alarm renewal and interruption cleanup when dropping diagnostics. [Queue recovery](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts), [async recovery](../../../packages/system-worker/src/externalOperations/makeExternalOperationQueue.ts).

## Selected row and review limits

```ts
{
  outboxIndex: number; // primary key; local enqueue order
  continuationCommandId: string; // unique stable recorded child
}
```

Independent lifecycle/design reviewers traced all three fields, diagnostic subfields, enqueue/allocation, receiver admission, sender acknowledgement and recovery. The primary agent reconciled the difference between successful-admission acknowledgement and unused receipt metadata, and between the chosen FIFO protocol and a possible pending-set alternative. No source edits, tests, runtime storage inspection or fault injection were performed by this review.

Base commit: `7184c8ed01f6a78e84b7818186fcb0a9b3c6f98b`. Shared declaration SHA-256: `422f34b6650532b9dff2e9abb48d9097efe8e0bf3b3c6c36228fb8c4ae4179ef`; AggregateVersionRepo owner SHA-256: `ddf567ce2b1c63008e2341bf7a7b75434931056d6eb89d40d8fb4b68968e39fa`. Recheck current source before implementation because shared work continues.

Plan 186 completed and verified the settled diagnostic removal and retained FIFO. The reference rename was implemented by Plan 159. Changed fixed storage requires empty affected storage, with no aliases, fallback decoder, translation migration or automatic reset. The allocator is reviewed separately in the [asyncCommandOutboxHead record](aggregate-version-repo-async-command-outbox-head.md).
