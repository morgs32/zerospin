# AggregateChain command progress — admission

**Reviewed:** 2026-11-03. **Inspection baseline:** `0aa44e2e8c` plus the owned command-progress consolidation.

**Status:** Consolidation implemented and verified: all 52 focused Workers cases across four files pass, with complete test-program compilation and scoped type/library/lint checks under [Plan 151](../../plans/151-plan-storage-table-review.md). The former retain-separate-table verdict is superseded.

## Physical representation and decision

1. AggregateChain is identified by `{ systemId, aggregateId, aggregateName }`. It now owns one `commandProgress` row: required integer primary key `singleton` in slot 1, `admittedThroughIndex` and `finalizedThroughIndex`. The former `admissionPosition` and `finalizedPosition` tables are removed. See [declaration](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts#L10-L17) and [physical identity](../../../packages/system-worker/src/AggregateChain/aggregateChainName.ts).
2. `admittedThroughIndex` records the highest allocated `aggregateIndex`. `finalizedThroughIndex` records the contiguous prefix for which AggregateChain retained original `outcome` and complete pending deliveries. Both numbers are necessary; separate singleton tables supplied no ownership, transaction or recovery boundary. The maintainer approved a shared row on 2026-11-03.
3. [Activation](../../../packages/system-worker/src/AggregateChain/onRepoStartup/onRepoStartup.ts#L26-L33) inserts both fields at zero once, preserving an existing row. Reads explicitly require slot 1; missing initialized progress fails with `aggregate-command-progress-missing` rather than deriving a replacement from pruned commands.

## Admission transaction and recovery

1. [appendAggregateCommand](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/appendAggregateCommand.ts) allocates `admittedThroughIndex + 1`, checks the 64-command unhanded-off bound and safe-integer exhaustion, inserts the admitted command, then updates only `admittedThroughIndex`. It leaves `finalizedThroughIndex` unchanged.
2. Every append caller supplies an existing synchronous transaction: [Node batches](../../../packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommandsTx.ts), [Agent admission](../../../packages/system-worker/src/AggregateChain/admitAggregateAgentCommandTx.ts), [recorded Aggregate/Service delivery](../../../packages/system-worker/src/AggregateChain/admitRecordedAggregateCommandTx.ts), [direct System admission](../../../packages/system-worker/src/AggregateChain/admitDirectSystemAggregateCommandTx.ts) and [external completion admission](../../../packages/system-worker/src/AggregateChain/recordExternalOutcomeAndAdmitCommandTx.ts). A later failure rolls back the command, cursor update and producer checkpoint together. This includes a later refusal in a Node batch.
3. [executeCommandsThrough](../../../packages/system-worker/src/AggregateChain/executeCommandsThrough/executeCommandsThrough.ts) reads admission progress to bound its request; [readAggregateCommand](../../../packages/system-worker/src/AggregateChain/readAggregateCommand.ts) uses it to distinguish missing known history from an index never admitted. Direct System command-ID construction reads the same field inside admission.
4. Producer checkpoints still prevent duplicate allocation after retry. Node repeats report `expectedPushIndex` before append; recorded and Agent producer retries return existing checkpoint coverage. External completion command admission and pending-request deletion remain atomic. Direct System reinvocation deliberately creates another command.
5. [Canonical history adoption](../../../packages/system-worker/src/AggregateChain/adoptCanonicalAggregateHistory.ts) prunes local command history without deleting or updating either progress field. Repeated activation and Durable Object reconstruction preserve the row, including after the local command table becomes empty.

## Alternatives, scope and verification

1. Deriving admission progress from local command maxima fails after pruning; finalization and history handoff may lag admission. Combining those meanings into one number remains incorrect. The shared row removes only duplicate singleton storage.
2. This fixed-schema cutover requires empty affected AggregateChain storage. No compatibility alias, migration, fallback decoder or automatic reset is supplied. ServiceChain retains its existing separate tables under its independently queued review.
3. Independent production review found no actionable correctness issue. The existing four-file Workers run passes 52 cases, including combined-row rollback, independent field updates and reconstruction. Plan 151 records the exact commands, quality checks and proof limits.

## Remaining work

1. None for this consolidation. Continue the remaining bounded audit under Plan 151.
