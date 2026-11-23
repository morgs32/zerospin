# AggregateChain.aggregateChainProducers

**Reviewed:** 2026-11-03. **Inspection baseline:** `0aa44e2e8c` plus the verified commandProgress consolidation.

**Status:** Source review complete with independent lifecycle and primary column/design review. Retain all four fields and the separate domain-specific table; no runtime change or unresolved finding.

**Review queue:** [Plan 151](../../plans/151-plan-storage-table-review.md).

## Row meaning and physical context

1. Within one receiving AggregateChain `{ systemId, aggregateId, aggregateName }`, a row records the greatest source command-operation position durably admitted from another AggregateChain. It is a producer checkpoint, not a retained command or `outcome`. The source pair is unique. See [declaration](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts#L26-L41) and [receiving transaction](../../../packages/system-worker/src/AggregateChain/admitRecordedAggregateCommandTx.ts#L45-L99).
2. The checkpoint survives deletion of the corresponding local admitted commands, so lost admission replies can be retried without another admission. There is no row until that source first admits a command here; successful later deliveries replace only its position. Normal activation, history handoff and eviction do not delete it.

## Every field

1. **`aggregateName`:** Required text identifying the source aggregate declaration. It participates in the unique source pair. An aggregate ID alone does not identify its declaration across the System; dropping the name could conflate unrelated source Chains.
2. **`aggregateId`:** Required text distinguishing instances of that source declaration. Dropping it would conflate two source AggregateChains with independent command sequences.
3. **`sourceIndex`:** Required integer, the originating command's `aggregateIndex`, not this receiving Chain's allocated index. It orders work across source commands and source releases. It advances only with successful admission. One destination can receive a sparse subsequence because other operations address other destinations or are not command operations.
4. **`operationIndex`:** Required integer distinguishing multiple command operations within the same originating command. It can also be sparse. Keeping only sourceIndex would incorrectly suppress a later operation from that same command. The checkpoint compares `(sourceIndex, operationIndex)` lexicographically.

The physical database fixes the receiving owner and its System. The transaction requires equal source/receiving `systemId`, so no repeated System column is needed. Source release is absent intentionally: source AggregateChain order spans releases. A command ID, destination command index, copied payload, timestamp, result or hash adds no demonstrated checkpoint responsibility.

## Ordering, trust and acknowledgement

1. [AggregateChain's command-delivery queue](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L316-L365) binds the source to its own `this.key`, reads the earliest retained `(aggregateIndex, operationIndex)`, and sends one complete frozen operation. [makeCommandDeliveryQueue](../../../packages/system-worker/src/commandOperations/makeCommandDeliveryQueue.ts) preserves that single-operation page. [makeOutboxDelivery](../../../packages/core/src/outbox/makeOutboxDelivery.ts#L337-L352) serializes drains and awaits acknowledgement before reading the next pending operation. This ordering is the reason one greatest-position checkpoint safely covers earlier deliveries from that source to this destination.
2. [admitFromAggregateChain](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L508-L535) admits safe positive source indexes/nonnegative operation indexes and binds the receiving physical key. Its internal transaction checks same-System source identity. This is an internal Durable Object capability path; it trusts the source identity and frozen ordering supplied by the actual AggregateChain caller. It is not an arbitrary public payload-recovery API or cryptographic source-authentication mechanism.
3. A covered source position returns the saved acknowledgement before decoding/revalidating a new command or appending it. Changed retry payload is deliberately ignored for an already covered operation; the guarantee is checkpoint coverage under immutable source delivery, not payload equality. A newer position requires current command owner/support/payload validation before admission. Consecutive source positions are not required, because destination subsequences are sparse.
4. One synchronous `makeTx` commits the newly admitted command, `commandProgress.admittedThroughIndex` and this producer checkpoint together. Validation, backpressure or SQL failure rolls them all back. A lost reply after commit retries against the checkpoint without appending a second command. See [receiving transaction](../../../packages/system-worker/src/AggregateChain/admitRecordedAggregateCommandTx.ts#L45-L99) and [command append](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/appendAggregateCommand.ts).
5. [admitRecordedCommandFromAggregateChain](../../../packages/system-worker/src/commandOperations/admitRecordedCommand.ts#L27-L76) validates that returned checkpoint coverage includes its offered position. Only then does the source delete that exact pending delivery row. Destination admission acknowledgement does not establish destination execution, retained `outcome`, onward dispatch or provider completion.

## Retention and alternatives

1. Retain producer checkpoints for the receiving owner's lifetime. No current durable fact establishes that a source can never retry an older operation after a lost reply. Empty visible source outboxes, destination command pruning or current source-release selection do not authorize checkpoint deletion. Reusing a source storage identity with a restarted sequence while these checkpoints survive is not a supported recovery procedure.
2. The single commandProgress row cannot hold these values: one receiving Chain has many independent source AggregateChains, each with its own checkpoint. A shared record/JSON collection would reintroduce identity traversal and compound updates without removing that cardinality requirement.
3. Keep explicit Aggregate and Service producer tables/methods. Their source identities differ: aggregate name/ID pair versus service name. A combined table would need a domain switch, nullable alternative identity fields or an opaque encoded identity. No current requirement justifies that less explicit model; `ownerKind` and equivalent switches remain forbidden.
4. A future change permitting out-of-order source deliveries would invalidate the greatest-position assumption and must reconsider its checkpoint model. The current serial source queue satisfies the requirement; this review proposes no new coordination, sequence or history directory.

## Verification and remaining work

1. The existing [chain delivery scenarios](../../../packages/system-worker/tests/chain-command-delivery/chain-command-delivery.workerd.spec.ts) are part of the successful 52-case/four-file commandProgress run. Their real AggregateChain-source branch delivers frozen operations to both destination families, loses replies after admission, prunes receiver command rows, evicts/reconstructs objects and drains the same pending work without a second admission. This reuses actual runtime evidence from this turn; it is not a new exhaustive producer-checkpoint matrix.
2. The independent lifecycle reviewer and primary column/design reviewer found no supported-path correctness issue or redundant field. This table review changes only documentation; no additional runtime tasks, test files, live storage inspection or reset were performed.
3. None for this table. Continue Plan 151 with AggregateChain.serviceChainProducers, comparing its source identity/context before carrying common checkpoint reasoning forward.
