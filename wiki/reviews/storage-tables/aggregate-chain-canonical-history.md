# AggregateChain.canonicalHistory

**Reviewed:** 2026-11-03. **Source baseline:** `df74bc83a987eedd11e2faf6052ca1e3436a0f09`.

**Status:** Source review complete. Retain all three columns unchanged. No runtime defect or implementation change is recommended.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

## Verdict and physical owner

1. One row records which AggregateVersionChain release durably retains AggregateChain's handed-off contiguous finalized command prefix and the last covered `aggregateIndex`. This is a materialization-independent history-location checkpoint, not retained command history or proof of physical Archive delivery.
2. AggregateChain's physical identity is `{ systemId, aggregateId, aggregateName }`; those fixed dimensions need no repeated columns. Its configured canonical release can change, so the retained history-provider release cannot be derived from current configuration. See [owner identity](../../../packages/system-worker/src/AggregateChain/aggregateChainName.ts) and [table declaration](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts#L18-L25).
3. The table is absent before the first positive handoff. Readers interpret absence as no handed-off prefix. Ordinary disposal, reconstruction or canonical-selection changes do not delete the checkpoint.

## Every column

1. **`singleton`:** Nonnullable integer primary key. The only supported writer stores `1`, allowing the release and prefix boundary to be replaced as one row. Readers use that single row. Retain the physical row identity; it is not a command index or domain discriminator. No extra owner fields are justified.
2. **`aggregateVersion`:** Nonnullable integer identifying the AggregateVersionChain release whose logical history covers the adopted prefix. Written only from publication-proving acknowledgement by the configured canonical release. It may remain the previous canonical release while a newly selected release catches up. Historical lookup uses this stored value, not the latest configuration. Removing it would route reads to a release that may not retain the already-deleted prefix.
3. **`aggregateIndex`:** Nonnullable integer inclusive boundary of that retained contiguous prefix. The writer caps progress at AggregateChain's `commandProgress.finalizedThroughIndex`, rejects backward movement and requires positive coverage. Reads use it to partition retained history from the local admission suffix; admission uses it to bound the local suffix to 64 commands. It is distinct from admission progress, original-execution finalization progress and each replay subscriber's acknowledgement. Removing it loses the pruning boundary, read routing and admission backpressure.

See [writer and prefix deletion](../../../packages/system-worker/src/AggregateChain/adoptCanonicalAggregateHistory.ts), [single-command lookup](../../../packages/system-worker/src/AggregateChain/readAggregateCommand.ts), [replay lookup](../../../packages/system-worker/src/AggregateChain/readReplayPage.ts) and [admission bound](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/appendAggregateCommand.ts).

## Transaction, retry and recovery

1. The canonical AggregateVersionRepo commits its resource materialization and pending AggregateVersionChain publication before acknowledging replay. Its subscription cursor stops before the first pending publication, and page delivery drains publication through the delivered boundary. Materialization alone therefore cannot authorize handoff. See [publication-safe subscriber](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L173-L246).
2. AggregateChain supplies `adoptCanonicalAggregateHistory` as its replay fanout acknowledgement callback. Shared fanout storage advances the subscriber cursor, updates `canonicalHistory` and deletes the covered local command prefix in the same synchronous transaction, both during enrollment and ordinary acknowledgement. A rollback preserves all three; interruption before acknowledgement leaves local commands available for retry. See [AggregateChain callback](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L181-L190) and [shared acknowledgement/enrollment transactions](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueueStorage.ts#L176-L216).
3. Only the configured canonical release may change this checkpoint. A replacement release below the old boundary cannot replace the old history provider; an equally caught-up replacement may switch the stored release without increasing the boundary. Noncanonical subscriber progress remains separately tracked.
4. Reconstruction reads the durable checkpoint. Missing commands inside its range fail explicitly with `aggregate-history-missing`; missing local commands below the admitted tip also fail rather than pretending the history ended. Activation and original-execution acknowledgement retain recovery work for canonical subscription refresh. See [activation](../../../packages/system-worker/src/AggregateChain/onRepoStartup/onRepoStartup.ts), [refresh](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L114-L135) and the lookup procedures above.
5. AggregateVersionChain subsequently moves retained history into AggregateVersionArchive through its own acknowledged archive queue. Its logical history API spans local and archived rows; Archive acknowledgement permits that component's local deletion. AggregateChain neither waits for physical Archive delivery nor treats this checkpoint as Archive progress. See [archive lookup and queue](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L277-L324) and [Archive acknowledgement deletion](../../../packages/system-worker/src/AggregateVersionChain/AggregateVersionChain.ts#L480-L511).

## Evidence and limits

1. Independent lifecycle review and primary column/design review agree on retention. No timestamp, copied command, extra hash, generation, second history directory or new coordination mechanism has a demonstrated requirement.
2. The existing [Aggregate history handoff scenario](../../../packages/system-worker/tests/aggregate-history-fanout/aggregate-history-fanout.workerd.spec.ts#L39-L130) checks handoff while Archive delivery fails, local prefix deletion, reconstruction lookup and producer retry after pruning. It was inspected, not rerun. [Completed Plan 277](../../archive/plans/277-plan-canonical-chain-history-handoff.md) records earlier runtime verification; this source review does not refresh that evidence.
3. No tests, live storage inspection, runtime edits or storage reset were performed. This finding applies only to AggregateChain.canonicalHistory, reconciled with the implemented commandProgress row. ServiceChain's corresponding occurrence needs an explicit current-context comparison before carrying this reasoning forward.

## Remaining work

1. None for this table. Retain the current representation; continue the bounded inventory queue under Plan 151's review gate.
