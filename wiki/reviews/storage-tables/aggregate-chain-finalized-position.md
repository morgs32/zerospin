# AggregateChain command progress — finalization

**Reviewed:** 2026-11-03. **Inspection baseline:** `0aa44e2e8c` plus the owned command-progress consolidation.

**Status:** Consolidation implemented and verified: all 52 focused Workers cases across four files pass, with complete test-program compilation and scoped type/library/lint checks under [Plan 151](../../plans/151-plan-storage-table-review.md). Related finding: [admission progress](aggregate-chain-admission-position.md).

## Implemented representation

1. AggregateChain owns `commandProgress(singleton, admittedThroughIndex, finalizedThroughIndex)` in slot 1. Both progress fields are required integers, initialized together at zero once. The separate admission/finalization tables are removed. The distinct lifecycle meanings remain: `0 <= finalizedThroughIndex <= admittedThroughIndex`.
2. The shared row replaces two physical singleton tables inside one AggregateChain, without changing ownership or transaction boundaries. No new generic owner switch, synchronization mechanism or mirrored cursor is introduced. See [declaration](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts#L10-L17) and [activation](../../../packages/system-worker/src/AggregateChain/onRepoStartup/onRepoStartup.ts#L26-L33).

## Finalization transaction and recovery

1. [Original delivery](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts) selects the oldest command with null `outcome` and invokes its retained AggregateVersionRepo release. [recordOriginalCommandOutcomeTx](../../../packages/system-worker/src/AggregateChain/recordOriginalCommandOutcomeTx.ts) requires the initialized progress row, one decoded evaluated command, matching position/canonical command `id` and complete admitted input. First retention requires `finalizedThroughIndex === aggregateIndex - 1`.
2. One synchronous transaction retains `commands.outcome`, updates only `finalizedThroughIndex`, and inserts complete `commandDeliveryOutbox` and `externalOperationOutbox` rows. `admittedThroughIndex` remains unchanged. A late decoding/constraint/INSERT failure rolls every finalization write back. `outcome` retains `{ result: Success | Failure, finalizedAt }`; Failure carries no operations, and sparse operation indexes remain safe and ordered.
3. An identical retained `outcome` returns before advancing progress or recreating pending deliveries. A conflicting result or `finalizedAt` fails. This duplicate path does not recompare operations or `dispositionChainHash`, which AggregateChain does not retain as evaluated history. A lost original reply recovers committed output from the original AggregateVersionRepo release instead of evaluating the authored program again.
4. [readReplayPage](../../../packages/system-worker/src/AggregateChain/readReplayPage.ts) bounds shared input replay at `finalizedThroughIndex`. [Canonical history adoption](../../../packages/system-worker/src/AggregateChain/adoptCanonicalAggregateHistory.ts) caps its publication-proving handoff at that same boundary before pruning local commands. Neither operation resets either field. Publication acknowledgement, pending command delivery acknowledgement and physical Archive progress remain separate durable facts.
5. Cold activation preserves the complete row. A missing initialized row is an explicit `aggregate-command-progress-missing` failure; no fallback reconstructs progress from pruned command rows. Reads and writes explicitly select singleton slot 1.

## Existing verification seams and limits

1. The existing [producer-delivery scenarios](../../../packages/system-worker/tests/chain-command-delivery/chain-command-delivery.workerd.spec.ts) check admission advancing only its own field, atomic whole-batch rollback and rejected positions. ServiceChain branches retain their existing assertions.
2. The existing [Aggregate adapter-failure scenario](../../../packages/system-worker/tests/aggregate-adapter-failures/aggregate-adapter-failures.workerd.spec.ts) checks a late outbox fault preserving the `1/0` row, a later admission followed by original finalization producing `2/1`, subsequent external completion admission producing `3/1`, and duplicate/conflicting acknowledgements leaving that row unchanged.
3. The existing [history handoff scenario](../../../packages/system-worker/tests/aggregate-history-fanout/aggregate-history-fanout.workerd.spec.ts) inspects the exact three-field row, absent old tables, and both indexes after pruning/eviction. [Aggregate Agent scenarios](../../../packages/system-worker/tests/agent-node-aggregate/agent-node-aggregate.workerd.spec.ts) read the new admission field. All 52 cases in the focused four-file run pass; Plan 151 records exact commands and proof limits.
4. Independent production review found no actionable correctness issue. No existing store was reset; this fixed-schema change is verified only against fresh isolated disposable storage. ServiceChain's representation remains outside this approved change. No new test file, fixture, runner, glossary term or ADR was created.

## Remaining work

1. None for this consolidation. Continue the remaining bounded audit under Plan 151.
