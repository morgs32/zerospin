# Handoff for Aggregate predecessor catch-up

**Date** 2026-11-19

**Status** Cutoff and delivery ownership decided. Use the [implementation handoff](2026-11-19-handoff-remove-canonical.md#implementation-order) for the agreed work. The source trace below describes the prototype at `037f63258a` on `codex/owner-worker-integration`.

## Decision

Save the named predecessor’s published head once on first use for the child and Aggregate instance. Perform a bounded pull through the saved position. The owner Chain supplies subsequent finalized commands. A branch from V2 at published position 10 inherits through 10 even if the owner Chain has finalized 12. [Accepted decision](../adrs/025-canonical-published-history-handoff.md#aggregate-initialization-cutoff-2026-11-19)

## Prototype flow

1. **Fix the position.** When V3 first needs an Aggregate instance, `AggregateChain.prepareAggregatePredecessor({ aggregateVersion: 3 })` resolves V3’s declared predecessor, say V2. It saves the **owner Chain’s finalized position** for this instance and child release. Retries reuse that position. If V2’s `AggregateVersionChain.getEvaluatedCommand({ aggregateIndex: point })` returns null at a positive position, the Chain asks **V2’s Repo** to call `replayCommandsFanoutSubscriber(...).catchup(point)` against the owner Chain. [Predecessor preparation](../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L632)
2. **Read V2 into V3.** V3’s Repo calls **V2’s VersionChain** directly with `getEvaluatedCommandPage({ afterIndex, maxIndex: point })`. That RPC returns one bounded page and V2’s published head as `lastIndex`. A call with `{ afterIndex: 0, maxIndex: 0 }` returns the head with an empty page. `initializeAggregatePredecessor` owns the catch-up loop. It starts from V3’s materialization position, restores V2’s evaluations for a branch or evaluates the inputs under V3 for a rebuild, and publishes through each page. [Initializer](../../packages/system-worker/src/AggregateVersionRepo/initializeAggregatePredecessor.ts#L38) · [Page RPC](../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L532)
3. **Continue from the owner Chain.** After initialization, V3’s activation runs ordinary `catchupMaterialization` against `AggregateChain.replayCommandsFanout`. The owner Chain supplies subsequent finalized commands to listed releases. [Activation](../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L330) · [Ordinary catch-up](../../packages/system-worker/src/AggregateVersionRepo/catchupMaterialization/catchupMaterialization.ts)

## What the queue provides

1. `subscriber.catchup(point)` calls the named queue’s `getPage({ afterIndex, maxIndex: point })`, passes each delivery to `receive`, rereads the receiver’s durable cursor, and stops once it covers the point. Without an explicit point it uses the first page’s reported tip for that invocation. [Catch-up loop](../../packages/system-worker/src/makeFanoutSubscriber/runFanoutCatchup.ts#L42)
2. `subscriber.subscribe(point)` performs that catch-up and **then** calls `queue.subscribe({ ...key, currentIndex })`. The source records the receiver’s actual cursor and wakes delivery. The argument bounds the initial pull. Enrollment continues beyond that position. [Subscriber calls](../../packages/system-worker/src/makeFanoutSubscriber/subscribe.ts#L34) · [Source enrollment](../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L481)
3. The predecessor’s VersionChain exposes Actor and Agent fanouts. Their queue readers and the direct `getEvaluatedCommandPage()` RPC use the same private `#readPage`. The child currently gets evaluated history by calling the direct RPC. Separately, the owner Chain’s current replay queue also calls that RPC when serving a compacted canonical prefix. [VersionChain fanouts](../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L147) · [Current compacted replay read](../../packages/system-worker/src/AggregateChain/readReplayPage.ts#L31)

## Open decisions

1. **Which catch-up code can be shared?** Compare the initializer’s direct page loop with the queue’s bounded pull and durable progress checks. The implementation choice must preserve the fixed cutoff and each history mode’s receiver behavior.
2. **What proves the rebuilt input?** A fresh rebuild currently also calls `AggregateChain.getAggregateCommand(index)` to validate identity. Whether the named predecessor’s published page suffices for that check remains open. [Identity check](../../packages/system-worker/src/AggregateVersionRepo/validateCommandIdentity.ts#L27)

## Suggested skills

1. `$implement` to apply the agreed cutoff and bounded predecessor read.
2. `$grill-with-docs` for the remaining question about historical input evidence.

## Pointers

1. [Settled release and compaction decisions](2026-11-19-handoff-remove-canonical.md#settled-ownership)
2. [Prototype and recovery evidence](2026-11-19-handoff-owner-worker-original-execution.md#aggregate-prototype)
