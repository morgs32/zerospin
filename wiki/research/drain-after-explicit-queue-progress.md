# Replacing `drainAfter` with explicit queue progress

**Researched:** 2026-10-18 against working tree `ece535eaf7` plus existing uncommitted work. Source inspection only; no production edits or runtime verification.

**Finding:** Remove `drainAfter` as an interface choice. Its name currently hides recovery acquisition, producer lifetime and background scheduling, while `drain()` has different completion semantics. Make those responsibilities explicit at the owning orchestration boundary; deleting the wrapper does not require retaining its exact implementation. The historical evidence below distinguishes the requirements from the mechanism inspected before implementation.

## Behavior at research time

- **Outbox:** `drainAfter` increments active producers, awaits `alarmRegistry.hold(name)`, lazily runs the producer with its previous interruptibility, then increments the producer revision, decrements the count and calls `wake().pipe(Effect.exit)` on every producer exit after the hold completed. The wake failure therefore cannot replace the producer result or Cause. An overlapping empty drain releases its alarm only if there are no active producers and no newer producer revision. [Producer lifetime](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L279-L307), [release check](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L344-L358).
- **`wake()` and `drain()` differ:** outbox `wake()` arms the alarm and starts a ManagedRuntime delivery without awaiting acknowledgement; outbox `drain()` awaits the ordered page loop, including subscriber receipt, local acknowledgement and `afterAcknowledge`. Replacing `drainAfter` with an awaited `drain()` changes when the caller returns and which delivery failures reach it. [Wake and drain](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L328-L358), [receipt and acknowledgement](../../packages/core/src/outbox/makeOutboxDelivery.ts#L288-L296), [page loop](../../packages/core/src/outbox/makeOutboxDelivery.ts#L327-L342).
- **Fanout:** `drainAfter` acquires `producerLease`, runs the callback through a nested synchronous runner and closes its private scope. The lease's finalizer wakes background delivery. Fanout's `drain()` starts an independent ManagedRuntime invocation and awaits its Exit, so cancelling that awaiting Effect does not own delivery cancellation. [Fanout producer and wrapper](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L298-L335), [delivery ownership](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L380-L410). An exhaustive current-package search, `rg -n 'drainAfter' packages --glob '!**/dist/**'`, finds no FanoutQueue caller; its method and public declaration are unused. [Declaration](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L65-L76).

## Why literal success-only sequencing is insufficient

`yield* program; yield* queue.drain()` skips the second statement when `program` fails or is interrupted. Current producers are not all one atomic operation: Aggregate original pages and both replay receivers process commands sequentially, with each replay command opening its own `materializeCommandTx`. A later command can fail after earlier publication rows committed. Service original delivery itself accepts exactly one occurrence. [Aggregate original loop](../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommandRows.ts#L14-L34), [Aggregate replay loop](../../packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommands.ts#L10-L21), [Aggregate per-command transaction](../../packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts#L36-L44), [Service replay loop](../../packages/system-worker/src/ServiceVersionRepo/replayCommands/replayCommands.ts#L9-L18), [Service per-command transaction](../../packages/system-worker/src/ServiceVersionRepo/replayCommands/replayCommand.ts#L40-L48), [Service original cardinality](../../packages/system-worker/src/ServiceVersionRepo/executeCommand/executeCommandRows.ts#L19-L31), [transaction commit/rollback boundary](../../packages/core/src/drizzle/make/makeTx.ts#L65-L96).

`AggregateChain.executeAggregateCommand` admits first, then awaits `AggregateVersionRepo.awaitCommandResult`; failure after admission must still leave original delivery recoverable. VersionRepo activation also awaits replay through a subscriber RPC inside `makeMigratableDORepo`'s constructor gate. Adding an awaited outgoing drain to activation would extend initialization to downstream publication. [Admission then result RPC](../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts#L23-L62), [Aggregate activation](../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L221-L225), [catchup RPC](../../packages/system-worker/src/AggregateVersionRepo/catchupMaterialization/catchupMaterialization.ts#L7-L18), [constructor gate](../../packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L281-L330).

Effect already supplies the lifecycle primitive: `ensuring` delegates to `onExit`, whose finalizer runs for success and failure with interruption disabled. `scoped` closes its scope on exit, and `acquireRelease` registers release after acquisition under an interruption mask. Callers can express this directly; they do not need a queue-owned callback wrapper. [Installed Effect ensuring/onExit](../../node_modules/effect/src/internal/effect.ts#L4166-L4254), [scope and acquisition](../../node_modules/effect/src/internal/effect.ts#L4101-L4151).

## Recovery requirement, without overclaiming

`makeAlarmRegistry.hold` persists an alarm; merely registering recovery runs no operation. Cloudflare guarantees execution for a scheduled alarm, and alarm operations follow storage-operation rules. Cloudflare also documents automatic atomic batching for writes without an intervening await. Therefore, **pre-arming is the current solution, not a universal requirement for every synchronous transaction**: an explicit design could establish the alarm alongside production without a suspension gap. It must, however, cover asynchronous producers, partially committed pages, failure/interruption and overlapping empty-drain release. Neither a pending row nor an in-memory finalizer alone schedules a future invocation. [Registry hold/registration](https://github.com/morgs32/zerospin/blob/ece535eaf7f5d7fa5838347d45e490733c61bd5f/packages/system-worker/src/makeAlarmRegistry/makeAlarmRegistry.ts#L23-L58), [Cloudflare alarms](https://developers.cloudflare.com/durable-objects/api/alarms/#background), [Cloudflare automatic atomic writes](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transaction).

**Original recommendation:** Delete the unused fanout wrapper. Replace outbox wrapper calls with explicit producer/recovery lifetime and explicit completion scheduling at each Repo/Chain boundary, using Effect exit/finalizer semantics where earlier commits can survive failure. Preserve background `wake()` for admission, projection and activation; reserve awaited `drain()` for callers that intentionally require delivery acknowledgement. Whether to redesign or rename those operations is a separate interface decision, not a reason to retain `drainAfter`.

## Implemented replacement

The approved 2026-10-18 change removes `drainAfter` from outbox and fanout queues.
Both expose scoped `producerLease` Effects: acquire durable recovery before
production, then update active-producer count and revision when the scope closes.
Lease release does not schedule delivery. Existing drain release guards continue
to protect concurrent producers. [Outbox queue](../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts),
[fanout queue](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts).

Repo and Chain producers explicitly run `wake()` after producing. Producers that
can retain earlier commits on a later failure use
`Effect.ensuring(queue.wake().pipe(Effect.exit))`, preserving their original Exit
while still scheduling delivery. Fanout append and enrollment explicitly wake;
original acknowledgement hooks acquire a replay producer lease and explicitly
wake replay on exit, protecting newly finalized history from an older captured-tip
drain clearing recovery before the queued pass starts. Awaited `drain()`
continues to mean delivery and acknowledgement. [AggregateVersionRepo](../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts),
[ServiceVersionRepo](../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts),
[AggregateVersionChain](../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts),
[ServiceVersionChain](../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts).

`AggregateChain.executeAggregateCommand` acquires recovery around admission,
explicitly wakes original delivery, then awaits `AggregateVersionRepo.awaitCommandResult`.
Pending-row production therefore remains protected if result retrieval fails.
No fixed schema changes are introduced. [Aggregate admission and result retrieval](../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts).

The preceding source line references describe the research snapshot; the linked
current implementations above own the replacement behavior. Verification is
reported by the implementation chat, independently of these source findings.
