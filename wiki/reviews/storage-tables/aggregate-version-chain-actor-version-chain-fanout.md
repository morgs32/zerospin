# AggregateVersionChain.actorVersionChainFanout

**Reviewed:** 2026-10-15, against current working-tree source after Plan 200. One physical table reviewed; subscriber progress and immutable history were read only as dependencies.

**Verdict: remove the redundant physical payload table.** The maintainer approved
[Plan 202](../../archive/plans/202-plan-aggregate-version-chain-commands-and-actor-fanout.md):
rename immutable AggregateVersionChain `executionHistory` to `commands`, and deliver
the same complete `IEvaluatedCommand` directly through the retained actor queue.
Keep actor subscriber cursors, source-bound capabilities, producer leases, fixed-tip
paging and alarms. Introduce no replacement pointer, marker or payload table.

**Decision status:** Implemented and verified on 2026-10-15. Plan 202 passed the scoped nine-task graph, 27 Workerd tests and all thirteen contract acceptance groups.
[ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md#decision)
now records the bounded amendment. [Plan 200](../../archive/plans/200-plan-aggregate-operation-context.md)'s
full evaluated-command representation remains intact. [Plan 151](../../plans/151-plan-storage-table-review.md)
tracks this completed table review and the remaining queue.

## Approved lifecycle amendment

1. `appendEvaluatedCommandsTx` retains full immutable `commands`. Actor payload
   insertion, its delivery-reader override and actor-only backfill/pruning hooks
   were removed in Plan 202; the approved [Plan 203](../../archive/plans/203-plan-aggregate-version-chain-agent-fanout.md)
   now removes the corresponding agent copy and hooks.
2. The actor queue reads `commands` directly for bounded delivery and catch-up.
   AggregateActorVersionRepo commits resources, materialization progress and complete
   pending selected publication before its receipt advances actor subscriber progress.
   That receipt does not prove AggregateActorVersionChain publication.
3. Late actor activation catches up and enrolls its committed cursor. Retained commands
   cover the catch-up/enrollment interval. Lost receipts may redeliver commands;
   projection progress prevents reapplication. Actor acknowledgement never deletes commands.
4. Both Aggregate fanout queues read `commands` directly while preserving independent
   subscriber progress, producer leases and alarm recovery. Plan 203 records verification
   of the agent change separately. ServiceVersionChain is unchanged.
5. This fixed-schema cutover requires empty affected AggregateVersionChain storage.
   There is no migration, fallback decoder, dual path or automatic storage reset.
   Plan 202 records the required verification; additional `dispositionChainHash`
   validation remains explicitly deferred.

- [Current schema](../../../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts),
  [current queues and paging](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts),
  [append transaction](../../../packages/system-worker/src/AggregateVersionChain/appendEvaluatedCommandsTx.ts).

## Historical review — before Plan 202

The source-state descriptions and column review below record the original
Plan 200 snapshot. Its physical `executionHistory` and actor payload-copy lifecycle
are historical; the approved amendment above supersedes that storage design and
its former approval status. No delivery-loss defect was found in that prior design.

## Physical scope and represented fact

One AggregateVersionChain database is bound to `systemId / aggregateId / aggregateName / aggregateVersion`. The table has one complete evaluated command per `aggregateIndex`, shared by all enrolled actor projection subscribers. It is **complete pending delivery**, not a separate execution, materialized resource, recipient-specific message or permanent history. Its immediate recipients are `AggregateActorVersionRepo` instances; those Repos later publish selected output to their own Chains. The table name describes the actor publication path but obscures that immediate recipient.

All 16 values are copied unchanged from the same database's permanent `executionHistory`. No field records an actor recipient, delivery attempt, acknowledgement or distinct envelope. Every value is immutable while the row exists. A deleted row may be backfilled unchanged from history. Framework composition adds no resource metadata columns.

- [Physical owner](../../../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainName.ts), [identical table declarations](../../../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts), [full shape](../../../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts), [immediate actor recipient](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts).

## Historical lifecycle and failure boundaries

1. `AggregateVersionChain.appendEvaluatedCommands` validates the bound Aggregate ID/name and acquires both publication producer leases before its synchronous append. `appendEvaluatedCommandsTx` validates order and complete immutable duplicate equality against history. For a new position it encodes once and atomically inserts the identical row into history and the actor pending table. A repeated identical append returns without resurrecting deleted pending rows. Any append failure rolls back the transaction.
2. The actor queue captures one history tip per drain and reads pending rows in ascending pages of at most 64, bounded by that tip. `AggregateActorVersionRepo` applies model members and commits resource changes, materialization progress and complete pending selected publication in one transaction before its successful receipt. That receipt does not mean `AggregateActorVersionChain` has already retained the later selected publication.
3. Only after that receipt does the queue advance the actor subscriber's acknowledged position to the last delivered row. The advertised `lastIndex` is not the acknowledgement. Cursor advancement and actor pruning share one transaction.
4. Pruning deletes actor pending rows through `min(currentIndex)` across **all enrolled actor subscribers**. One slow or failing actor subscriber retains the suffix it still needs. With no actor subscribers, pruning deletes all actor pending rows. Neither operation deletes permanent history or establishes another family's acknowledgement.
5. Cold `AggregateActorVersionRepo` activation catches up from permanent history, rereads its committed cursor and enrolls it. Enrollment and backfill are atomic: backfill copies history above the minimum actor cursor into the pending table. This closes the catch-up/enrollment interval under the current design. Enrollment uses a producer lease outside the drain semaphore so activation cannot deadlock with delivery awaiting that Repo.
6. Lost receipts leave the actor cursor behind; repeated delivery skips already materialized positions. Failed actor deliveries preserve their cursors, allow other actors to progress and retain alarm recovery. Producer leases arm recovery before append; lease cleanup starts delivery, and producer revisions prevent a concurrent empty drain from releasing the new work's alarm hold.

- [Append owner/lease boundary](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts), [immutable comparison and inserts](../../../packages/system-worker/src/AggregateVersionChain/appendEvaluatedCommandsTx.ts), [paging](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts), [receipt and last-row acknowledgement](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts).
- [Actor prune/backfill](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts), [atomic acknowledgement/enrollment](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts), [activation and receiving procedure](../../../packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts#L55-L82), [catch-up before enrollment](../../../packages/system-worker/src/makeFanoutSubscriber/subscribe.ts), [projection transaction](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts), [selected publication commit](../../../packages/system-worker/src/aggregateProjection/commitProjectionTx/commitProjectionTx.ts).
- [Fixed-tip independent delivery](../../../packages/system-worker/src/makeFanoutQueue/runFanoutDeliveries.ts), [producer recovery and drain completion](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts).

## Historical column review

The common writers are new append and enrollment backfill. The common reader decodes complete commands for actor delivery; pruning reads only `aggregateIndex`. All columns below remain necessary parts of the approved full command **in history and on the wire**. Removing their second physical copy loses no command information because immutable history retains the exact values.

| Column                 | Meaning, nullability and necessity challenge                                                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aggregateIndex`       | Non-null primary key in admitted Aggregate order; bounds pages, projection application and pending deletion. Delivery must retain this position, but history already indexes it. No separate pending sequence is required.                                                    |
| `id`                   | Non-null unique canonical command identity; supplies model lineage, private completion identity and hash input. The local unique constraint mirrors history; immutable duplicate validation reads history, so this copy adds no identity protection.                          |
| `commandName`          | Non-null admitted contract name, emitted in selected command output. Retain the full admitted value; there is no actor-specific name here.                                                                                                                                    |
| `payload`              | Non-null encoded admitted input. The actor projection does not reevaluate it. Full-envelope retention is approved, but that does not require a second stored payload in the same database.                                                                                    |
| `externalOutcome`      | Nullable admitted external observation; null means no observation. Its result and original `recordedAt` are input provenance, separate from this release's evaluation. History preserves them exactly.                                                                        |
| `contractVersion`      | Non-null source contract version. Current evaluating declarations cannot replace historical input provenance. It remains part of the delivered full command.                                                                                                                  |
| `aggregateId`          | Non-null admitted Aggregate instance identity. It matches the database binding and is checked at append/projection boundaries. It is owner-derivable, but the approved full command includes it; remove the redundant row rather than introduce an abbreviated sibling shape. |
| `aggregateName`        | Non-null admitted Aggregate declaration identity, with the same owner/envelope reasoning as `aggregateId`.                                                                                                                                                                    |
| `aggregateVersion`     | Non-null original admission release. It may differ from the bound evaluating release during replay, so deriving it from the containing database would corrupt provenance.                                                                                                     |
| `origin`               | Non-null Actor/Agent/System authority. Actor projection uses it for identity visibility and private completion. A producer-null command can still have Actor authority.                                                                                                       |
| `nodeId`               | Nullable submitting Node identity, coupled to `sessionName` and `pushIndex`; used for private completion. Null means absent producer correlation, not System authority.                                                                                                       |
| `sessionName`          | Nullable producer session declaration, coupled to the same tuple; cannot be inferred solely from Origin or Aggregate position.                                                                                                                                                |
| `pushIndex`            | Nullable producer submission position. It is not interchangeable with `aggregateIndex`. The producer tuple is all null or all present.                                                                                                                                        |
| `outcome`              | Non-null result and `finalizedAt`; supplies private refusal and the original projection model-application time. Success may contain JSON null; Failure has no operations. No separate execution/finalization timestamp column exists.                                         |
| `dispositionChainHash` | Non-null release-local prefix over previous hash, position, command ID and `outcome.result._tag`. Projection uses it for progress and selected output. It does not fingerprint the full command or justify a second payload copy.                                             |
| `operations`           | Non-null ordered union of model mutations and frozen external descriptions. Model members drive projection; external members are skipped. Keep sparse `operationIndex`, model versions and frozen external IDs in the full history/delivery value.                            |

The primary key and `unique(id)` are the only indexes declared by this shape; there is no per-recipient index or delivery state. Present readers justify the full delivered value, not its duplicate storage. Dropping selected fields would create another command representation while leaving the redundant table, which is the weaker simplification.

- [Exact columns and codecs](../../../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts), [all-null/all-present producer schema](../../../packages/core/src/contracts/CommandSchema.ts#L112-L123), [projection binding](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/bindProjectionCommand.ts), [projection field consumers](../../../packages/system-worker/src/aggregateProjection/applyEvaluatedCommands/applyEvaluatedCommandsTx.ts).

## Structured fields

1. `origin` is Actor `{ kind, actorName, actorVersion, claims }`, Agent `{ kind, agentName, agentVersion }`, or System `{ kind }`. The literal `kind` selects authority; Actor claims are the full authored record and may contain null values. They are not delivery diagnostics.
2. `externalOutcome` is absent as SQL null, or Success `{ _tag, success, recordedAt }`, or Failure `{ _tag, failure, recordedAt }`. The failure is `{ _tag: 'ExternalRequestFailure', code: 'external-producer-failed', message }`. Successful JSON null remains distinct from no observation.
3. `outcome` is `{ result, finalizedAt }`; `result` is Success `{ _tag, success }` or Failure `{ _tag, failure }`. A public failure contains `_tag: 'ZerospinError'`, `code`, optional `scope`, `message`, nullable `status`, and JSON `extra`. `scope` is contract/actor/aggregate. Finalization time sits outside the branches and remains unchanged on retry. `externalOutcome.recordedAt` describes a different event.
4. Model operation members contain `operationIndex`, `modelName`, `modelVersion`, `resourceId`, `operationName`, and encoded `body`. Create body contains complete `attributes`; update contains an attributes patch; delete is empty; move contains `property`, `prevId`, `nextId` with model-specific reference/cursor codecs. Parent `id` supplies command lineage, and parent `outcome.finalizedAt` supplies application time. No inverse operation or prior resource snapshot is stored here.
5. External members contain `operationName: 'external'`, `operationIndex`, `externalContractName`, `externalContractVersion`, JSON `payload` and frozen `externalCommandId`. Parent `id`/`origin` and the bound original execution release supply omitted request context. Actor delivery does not execute or retry external work; AggregateChain owns those pending requests. Indexes remain strictly increasing nonnegative safe integers; replay may leave gaps. No array-level null is meaningful.

- [Origin](../../../packages/core/src/contracts/OriginSchema.ts), [external observation](../../../packages/core/src/contracts/ExternalOutcomeSchema.ts), [outcome](../../../packages/core/src/contracts/CommandOutcomeSchema.ts), [public failure](../../../packages/error/src/matchZerospinErrorCode.ts#L27-L37), [model envelope](../../../packages/core/src/contracts/encodeAppliedOperation.ts#L13-L22), [model body codecs](../../../packages/core/src/contracts/operationCodecs.ts), [external description](../../../packages/system-worker/src/externalOperations/externalOperation.ts), [union omissions](../../../packages/system-worker/src/AggregateVersionChain/evaluatedAggregateCommand.ts).

## Why remove the table

`executionHistory` is mandatory permanent storage in the **same** AggregateVersionChain, with the same complete row committed at the same instant. Actor delivery eligibility already comes from each actor subscriber cursor compared with that history's tip. The duplicate table adds no durable fact and no independently constructed message.

`makeFanoutQueue` already defaults `readDeliveryPage` to `readPage`, and this actor queue's `readPage` already reads complete immutable history. Delivering from history preserves bounded pages, full admitted input, exact outcomes/operations, retries, late enrollment and independent actor acknowledgements. It requires neither a pointer row nor rebuilding output from current resources. Permanent history survives all acknowledgements. Separate subscriber cursors provide actor delivery independence without separate payload storage.

The proposed change removes this table's declaration and append insert, its delivery-reader override, and actor backfill/pruning hooks. Retain the actor queue getter, source-bound receiving capability, subscriber table, producer lease and alarm recovery. The only lost behavior is deleting and later recreating a redundant copy; no command, acknowledgement or deliverable content disappears. Backfill currently reads the entire retained suffix with `.all()` solely to recreate these copies; that work also disappears. No measured performance claim is needed for the redundancy conclusion.

This deliberately challenges ADR 013's copy requirement. Resource-owning Repos still require complete pending publication because they must not retain execution/projected history; that argument does not establish a need for another identical row inside the history-owning Chain. The recommendation preserves Plan 200's full `IEvaluatedCommand` and does not revive the superseded one-column outbox-marker proposal.

- [Existing history reader and actor-only hooks](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts), [delivery reader fallback](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts), [cursor-based eligibility](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts), [governing copy requirement](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md#decision), [full representation decision](../../adrs/016-aggregate-original-operations-and-external-work.md#decision).

## Reconciliation and verification limits

The independent lifecycle reviewer found no pruning/enrollment loss bug and identified the table-level duplication. The independent column reviewer first retained the shape under ADR 013, then confirmed there is no technical capability lost by removing the whole redundant table while preserving full history-backed delivery. Both reviews agreed to keep all full-command fields in history and transport and remove this physical copy. The maintainer subsequently approved that architecture amendment in Plan 202.

Only this finding and Plan 151 were edited. Current source, declarations and relevant call paths were read; no runtime, TypeScript, lint, test, Explorer, provider or storage checks were run. No implementation or reset occurred. Additional publication `dispositionChainHash` validation remains deferred and is not a requirement of this finding. A later approved fixed-schema cutover requires empty affected storage and no compatibility paths.

**Implementation:** The approved Plan 202 amendment above replaces the former open decision. Required verification is tracked in that plan.

**Next table:** AggregateVersionChain.actorVersionChainFanoutSubscribers. The agent payload review is recorded separately; both subscriber tables remain individually unreviewed.
