# Evaluated Aggregate commands and shared outcome names

**Date:** 2026-10-15

**Status:** Complete on 2026-10-15, including the approved projected-history timestamp deletion. Implementation, documentation and required verification passed.

**Related:** [Plan 151](../../plans/151-plan-storage-table-review.md), [ordered operations union](199-plan-aggregate-ordered-operations-union.md), [history finding](../../reviews/storage-tables/aggregate-version-chain-execution-history.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md), [source-grounded research](../../research/evaluated-command-model-and-method-names.md).

## Agreed model and scope

1. Use one Aggregate-specific `IEvaluatedCommand` for the value returned by `AggregateVersionRepo.finalizeCommand`, its pending AggregateVersionChain publication, immutable AggregateVersionChain history and complete actor/agent fanout. It contains the **full admitted command**, canonical `id`, a non-null `outcome`, ordered `operations` and `dispositionChainHash`. Construct it once, encode/store it and return it; duplicate recovery returns that retained value without reevaluation or timestamp resampling.
2. Preserve every admitted input field: `id`, `commandName`, encoded `payload`, `externalOutcome`, source `contractVersion`, `aggregateId`, `aggregateName`, source `aggregateVersion`, complete `origin`, producer `nodeId`/`sessionName`/`pushIndex`, and `aggregateIndex`. The release-local non-null `outcome` replaces the nullable original outcome in the evaluation input. Do not create a second original-outcome field. This deliberately duplicates admitted input in each evaluating release's history and pending fanout; the benefit is one complete domain value rather than a selected-field sibling representation.
3. Replace the command property `commandOutcome` with **`outcome` throughout the shared Aggregate and Service command protocol**. Its exact shape is **`{ result: Success | Failure, finalizedAt: Date }`**: `finalizedAt` sits next to `result`, outside the Success/Failure branches. Replace the former branch `recordedAt` with this one outer timestamp. Keep the standalone `CommandOutcomeSchema`/`ICommandOutcome` names, whose command qualification identifies the domain independently of a containing object. The field/structure change includes retained rows, command types, RPC values, hash-helper arguments and all actual consumers; no aliases or parallel fields.
4. `IEvaluatedCommand` has no separate `executionStartedAt` or top-level `finalizedAt`: its finalization timestamp is **`command.outcome.finalizedAt`**. Remove the separate Aggregate execution-start sample. Aggregate source resources and projections use the same finalization sample, as described below.
5. Keep **`externalOutcome.recordedAt`**. It records the first external request observation, a separate event from finalizing the admitted continuation command. Preserve authored result fields, public failure fields and unrelated telemetry timestamps.
6. The full `IEvaluatedCommand` model and removal of `packet`/`occurrence` terminology apply to the Aggregate flow. Service adopts the same shared `outcome: { result, finalizedAt }` structure and its required consumers. Service's separate operation arrays, execution-start/resource timestamp behavior, other retained fields and method/module names remain outside the Aggregate model refactor.
7. Preserve the four embedded-context removals: model members omit `commandId`; external members omit `initiatingCommandId`, `origin` and `aggregateVersion`. Parent `id`/`origin` and the bound original execution release supply those values when AggregateChain constructs complete standalone pending requests. Standalone canonical model operations and pending external requests retain their complete schemas. Keep portable model versions, frozen external IDs/payloads and sparse `operationIndex`.
8. The admitted command's `aggregateVersion` remains its original admission release. The evaluating AggregateVersionRepo/AggregateVersionChain supplies its own bound release separately; replay may run the same admitted command against another release and produce a different `outcome`, operations and finalization time. Never overwrite source release provenance to make it look like the evaluating release.

## Exact shared outcome shape

```ts
outcome: {
  result: Success | Failure;
  finalizedAt: Date;
}
```

1. `Success` retains `{ _tag: 'Success', success }`; `Failure` retains `{ _tag: 'Failure', failure }`, using the existing canonical result/failure codecs. Neither branch contains a timestamp. `CommandOutcomeSchema` represents the outer object with a union under `result` and the date codec under `finalizedAt`.
2. The exact access paths are **`command.outcome.result`** and **`command.outcome.finalizedAt`**. Branch selection uses `command.outcome.result._tag`; payload access uses `.result.success` or `.result.failure`. A command whose original outcome is pending still has `outcome: null`, not a wrapper with `result: null`.
3. Disposition hashing reads **`outcome.result._tag`**. Preserve the same ordered preimage values: `[previousHash, position, commandId, outcome.result._tag]`. The wrapper and timestamp do not enter the digest. Duplicate outcome comparisons preserve the complete outer object, including `finalizedAt`.

## Finalization timestamp and atomicity

1. Sample one logical `finalizedAt` inside the synchronous materialization transaction, after command identity/progress checks and before resource application. Pass that same sample into resource application and final outcome construction. Remove the later independent `new Date()` from outcome construction. The sample represents this atomic finalization, not an execution duration or an independently durable start event.
2. Evaluation produces a result and authored operations before resource application. Resource application can still reject. On success, retain Success under `outcome.result` and the encoded ordered operations; a retained public Failure under `outcome.result` has no operations after the business savepoint rolls back. Both use the same outer `outcome.finalizedAt` from that transaction.
3. Commit resource changes or retained Failure, `outcome`, the complete pending evaluated command and the materialization head atomically. An infrastructure failure rolls back the transaction and retains no new evaluated command. `finalizeCommand` returns the committed value or recovers the previously committed one. Its timestamp remains unchanged across retries, publication, fanout and late projection.
4. Use `outcome.finalizedAt` as `appliedAt` for Aggregate source model writes and projection model application. This makes source/projection `createdAt` and `updatedAt` agree and prevents late projection from substituting catch-up time. Sample placement must be shared by all operations of one command; do not resample per operation or after model writes.
5. Remove the existing `executionStartedAt` column from selected Aggregate history and its shared pending-publication shape outright; do not rename it to `finalizedAt` or retain a replacement timestamp column. Remove the transient implementation's `finalizedAt` column and its projection-publication writer plumbing. Model application still reads `command.outcome.finalizedAt` from the source evaluated command; projected delta/history requires no separate command timestamp. Keep private completion filtering and browser command shapes intact; do not expose full admitted payload/Origin or server-only outcome data to browser command frames.
6. The shared Service outcome timestamp becomes `outcome.finalizedAt`, preserving its existing first-finalization sampling point. Unifying Service resource application with that timestamp is a separate behavioral change and is not part of this Aggregate refactor.

## Names and module responsibilities

Replace the old symbols/files outright. The old column lists and the old five-file implementation footprint no longer constrain this plan.

| Current name                                                                                     | Agreed replacement                                                       | Responsibility                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AggregateVersionChain/aggregateExecutionPacket.ts`                                              | `AggregateVersionChain/evaluatedCommand.ts`                              | Own `EvaluatedCommandSchema`, `IEvaluatedCommand`, `evaluatedCommandShape`, and the embedded evaluated-operation schema/type.                            |
| `AggregateExecutionPacketSchema` / `IAggregateExecutionPacket` / `aggregateExecutionPacketShape` | `EvaluatedCommandSchema` / `IEvaluatedCommand` / `evaluatedCommandShape` | One full admitted command plus release-local final outcome, ordered operations and hash.                                                                 |
| `AggregateExecutionOperationSchema` / `IAggregateExecutionOperation`                             | `EvaluatedOperationSchema` / `IEvaluatedOperation`                       | The ordered model/external union without repeated parent context.                                                                                        |
| `appendExecutionPackets` / `appendExecutionPacketsTx`                                            | `appendEvaluatedCommands` / `appendEvaluatedCommandsTx`                  | Append immutable evaluated commands and complete fanout in one synchronous transaction. RPC input is `commands`.                                         |
| `IAggregateCommandOccurrence`                                                                    | `IAdmittedAggregateCommand`                                              | Complete admitted Aggregate input, position and nullable original outcome.                                                                               |
| `readAggregateCommandOccurrence`                                                                 | `readAdmittedAggregateCommand`                                           | Decode retained admitted input and supply bound Aggregate owner identity.                                                                                |
| `readAggregateOccurrenceTx`                                                                      | `readAggregateCommandTx`                                                 | Validate command identity, original/replay authority and contiguous materialization progress.                                                            |
| `executeAggregateOccurrence`                                                                     | `executeAggregateCommandTx`                                              | Evaluate and apply under the business savepoint; distinguish retained public Failure from outer transaction failure.                                     |
| `finalizeAggregateOccurrence`                                                                    | `makeEvaluatedCommand`                                                   | Assemble the one complete evaluated command from input, execution result, shared finalization sample and hash. No temporary selected-field domain value. |
| `retainAggregateResultTx`                                                                        | `retainEvaluatedCommandTx`                                               | Encode/insert the already constructed command and advance the materialization head without rebuilding its fields.                                        |
| `applyAggregateOutputTx`                                                                         | **`applyAggregateOperationsTx`**                                         | Apply model mutations and encode the ordered operation union; carry frozen external descriptions without invoking requests.                              |
| `acknowledgeOriginalFinalization`                                                                | **`recordOriginalCommandOutcomeTx`**                                     | Validate the original evaluated command, retain its original outcome and insert complete pending external requests atomically.                           |
| `prepareProjectionOccurrence`                                                                    | **`bindProjectionCommand`**                                              | Validate the evaluated command and bind its model operations to exact projection-release declarations.                                                   |
| `applyExecutionPackets` / `applyExecutionPacketsTx`                                              | `applyEvaluatedCommands` / `applyEvaluatedCommandsTx`                    | Apply delivered evaluated commands to Aggregate projections. Rename the containing directory too.                                                        |
| `executionPacketsFanoutSubscriber`                                                               | `evaluatedCommandsFanoutSubscriber`                                      | Subscribe Aggregate projections to the bound history/fanout. Rename the containing directory too.                                                        |
| `AggregateVersionChain.getAggregateResult` / internal `AggregateVersionRepo.readCommandResult`   | `getEvaluatedCommand` / `readEvaluatedCommand`                           | Recover the full retained evaluated command.                                                                                                             |

1. Use the three specifically agreed method names above, including `recordOriginalCommandOutcomeTx`; standalone method/type names may qualify the command domain even though the contained property is simply `outcome`.
2. Keep `finalizeCommand`, `finalizeCommandRows`, `materializeCommandTx`, `awaitCommandResult`, `evaluateAggregateCommand` and meaningful original/replay/execution terms. Remove the redundant inferred `IAggregateCommandFinalization` alias when callers can name `IEvaluatedCommand` directly. Replace local `packet`/`occurrence` variables with `command`, `evaluatedCommand` or explicit command/finalization context as appropriate.
3. Update Aggregate error codes/messages, named spans, imports, RPC capability declarations, comments and current docs with the same vocabulary. Keep genuine command references such as standalone `commandId` fields; canonical `id` applies to the command itself and does not require renaming unrelated foreign keys.
4. Keep physical responsibilities named `executionHistory`, `aggregateVersionChainOutbox`, `actorVersionChainFanout`, `agentVersionChainFanout`, subscriber progress and `materializationHead`. Do not rename queues/tables merely because their values change. Historical plans/research may retain old names as historical evidence; current Aggregate guidance must describe the new model.

## Implementation sequence

1. Inspect the current working-tree diff and preserve unrelated materialization-head, external-work and other edits. Reuse the already present four-field removal rather than recreating it from HEAD. This approved plan supersedes the earlier eleven-column constraint and the temporary selected-context representation.
2. Change the shared schema and canonical command/receipt types to `outcome: { result: Success | Failure, finalizedAt }`, moving the former branch timestamp to the outer object. Update Aggregate and Service writers/readers, standalone executed-command storage, shared disposition-hash inputs, browser/Node consumers, SDK-facing types and existing verification data. Every branch/tag/payload consumer reads through `outcome.result`; timestamp consumers read `outcome.finalizedAt`. Keep the hash's exact ordered preimage values and tag-only semantics unchanged; additional hash validation remains deferred.
3. Define `EvaluatedCommandSchema`/`IEvaluatedCommand` from full admitted command fields and canonical `id`; define the ordered evaluated-operation union without repeated context. Replace all affected Aggregate fixed publication/history/fanout shapes directly. Keep the producer all-null/all-present tuple and canonical model/external codecs.
4. Rename the Aggregate command helpers and restructure construction so `makeEvaluatedCommand` produces the complete shared value once. `retainEvaluatedCommandTx` stores it directly; original finalization and recovery return it directly. Remove the superseded Aggregate-only intermediate final-command schema if it has no remaining distinct consumer; introduce no replacement wrapper or compatibility alias.
5. Thread one finalization sample through Aggregate model application and outcome construction. Remove Aggregate `startedAt`/`executionStartedAt` plumbing. Delete the projected-history timestamp column and its shared pending-publication field, including the transient `finalizedAt` replacement and the unused `commitProjectionTx` parameter/caller argument. Preserve the original/replay contract and freeze original external descriptions before resource application as today.
6. Update AggregateChain to validate all immutable admitted input fields against its retained command, using canonical `id`. Reconstruct complete pending external requests from the parent and original bound release while recording the original outcome. A matching repeated outcome returns without recreating requests. AggregateChain still retains only original outcome plus pending requests; it does not acquire full evaluated-command history.
7. Update AggregateVersionChain append, result recovery, actor/agent fanout and RPC capabilities for the new value. Preserve full evaluated-command equality on duplicate publication, contiguous order, Failure/empty output, mixed operation order, duplicate external ID rejection, exact model codecs and rejection of an unavailable bound release for external-only output.
8. Update shared Aggregate projection application/binding/subscription, AggregateActorVersionRepo and AggregateAgentVersionRepo callers, selected history/session consumers and existing snapshot type dependencies. Apply model members only, with parent `id` and `outcome.finalizedAt`. Preserve private completion filtering, selected output behavior and independent acknowledgement/deletion lifecycles.
9. Repair the existing verification type error recorded below and update existing scenarios for the full admitted representation, canonical `id`, outcome/timestamp names and renamed methods/spans. Assert complete input round trips, parent-derived context, exact original recovery, immutable contradictions, original/replay release provenance and timestamp preservation. Create no test, fixture, runner or configuration file.
10. After implementation, reconcile AGENTS canonical field guidance, the glossary, ADR 016's current amendments, affected module READMEs, current architecture/pattern guidance, both findings and Plan 151. Clearly supersede the eleven-column and separate execution-time conclusions with this approved model. Historical plan results remain historical. Create no new ADR solely for these naming changes.
11. Run the permitted scoped checks below, repair in-scope failures and record the result. Archive this plan only when implementation, documentation and required verification are complete.

## Planned files

`+` creates a file, `~` edits an existing file, and `→` renames/replaces a file or directory directly. This lists the intended footprint; actual consumers discovered through the renamed shared schemas are in scope.

```text
zerospin/
  ~ AGENTS.md
  wiki/plans/
    ~ 200-plan-aggregate-operation-context.md
    ~ 151-plan-storage-table-review.md
  packages/core/src/
    ~ contracts/{CommandSchema,CommandOutcomeSchema,ExecutedCommandSchema,types,dispositionChainHash}.ts
    ~ aggregateSession/aggregateProjectedCommandsTable.ts
    ~ affected command/receipt and Node consumers
  packages/system-worker/src/
    AggregateChain/
      ~ AggregateChain.ts, aggregateChainDbConfig.ts, types.ts and admitted/replay callers
      → readAggregateCommandOccurrence.ts → readAdmittedAggregateCommand.ts
      → acknowledgeOriginalFinalization.ts → recordOriginalCommandOutcomeTx.ts
    AggregateVersionRepo/
      ~ AggregateVersionRepo.ts, aggregateVersionRepoDbConfig.ts, materializeCommandTx.ts
      ~ finalizeCommand/, replayCommands/, replayCommandsFanoutSubscriber/, validateCommandIdentity.ts
      → readCommandResult/ → readEvaluatedCommand/
      utils/
        → readAggregateOccurrenceTx.ts → readAggregateCommandTx.ts
        → executeAggregateOccurrence.ts → executeAggregateCommandTx.ts
        → finalizeAggregateOccurrence.ts → makeEvaluatedCommand.ts
        → retainAggregateResultTx.ts → retainEvaluatedCommandTx.ts
        → applyAggregateOutputTx.ts → applyAggregateOperationsTx.ts
        ~ evaluation/preparation helpers using renamed types and finalization context
    AggregateVersionChain/
      ~ AggregateVersionChain.ts and aggregateVersionChainDbConfig.ts
      → aggregateExecutionPacket.ts → evaluatedCommand.ts
      → appendExecutionPacketsTx.ts → appendEvaluatedCommandsTx.ts
    aggregateProjection/
      → applyExecutionPackets/ → applyEvaluatedCommands/
      → prepareProjectionOccurrence.ts within that directory → bindProjectionCommand.ts
      → executionPacketsFanoutSubscriber/ → evaluatedCommandsFanoutSubscriber/
      ~ commitProjectionTx/, types.ts and affected snapshot/projection consumers
    ~ AggregateActorVersionRepo/ and AggregateAgentVersionRepo/ callers
    ~ aggregateSessionChain/ selected-history consumers
    ~ repoServices/AggregateVersionChains.ts
    ~ shared Aggregate/Service disposition-hash helpers
    ~ Service command/outcome schema consumers (shared field renames only)
    ~ affected module README.md files
  packages/browser/src/
    ~ existing command outcome consumers
  packages/sdk/src/
    ~ command type exports if required by the shared schema change
  packages/system-worker/test/
    ~ existing affected Workerd scenarios/profiles and snapshots
  scripts/
    ~ verify-plan140.mjs
  wiki/
    ~ glossary.md, adrs/016-aggregate-original-operations-and-external-work.md
    ~ affected current architecture/pattern guidance and the two recorded findings
```

## Verification and hard cutover

1. Reinspect resolved Nx configuration once before execution. Use one explicit dependency graph for affected core and system-worker production/source TypeScript, lint and existing Workerd/test TypeScript, plus the directly affected browser command consumer and SDK type/export checks when their source changes. Preserve required dependencies/caches; do not launch overlapping graphs writing shared outputs. No Explorer verification is permitted or required.
2. Run existing `node scripts/verify-plan140.mjs` against current artifacts. Reuse meaningful existing scenarios for full admitted input retention, canonical `id`, mixed output order, sparse replay indexes, original/replay release separation, complete reconstructed external requests, source/projection timestamp agreement, lost-reply recovery before/after pending deletion and contradictory duplicate rejection. Shared Service checks must verify the renamed outcome/timestamp without changing its unrelated representation.
3. Verify Success and retained Failure sit under `outcome.result`, with `finalizedAt` next to `result` and no branch timestamp. Branch selection and disposition hashing use `outcome.result._tag`. Infrastructure rollback retains neither new evaluated output nor partial resource/progress changes. Check that retries, late catch-up and restart preserve `outcome.finalizedAt`, and external observations still preserve `externalOutcome.recordedAt`.
4. Check scoped formatting, whitespace, documentation links and import/file moves. Scan active Aggregate flow/source/tests for superseded schema/helper names, `packet`/`occurrence` terminology and `executionStartedAt`. Scan shared command consumers for stale `commandOutcome` properties, direct `outcome._tag`/`outcome.success`/`outcome.failure` access and command-outcome branch timestamps, distinguishing the deliberately retained standalone schema/type/method qualification and external observation timestamps.
5. Verify Aggregate projected-history and pending-publication schemas contain neither `executionStartedAt` nor `finalizedAt`; retain source/projection resource timestamp agreement and immutable duplicate behavior. Changed fixed schemas require empty affected storage, including the shared outcome fields on affected Aggregate/Service retained rows, expanded Aggregate evaluated-command publication/history/fanout and removal of the Aggregate selected-history/pending-publication timestamp column. Add no migration, decoder fallback, alias, translation or dual representation. No storage reset, provider call, commit, publication or deployment is authorized.

## Verified result

1. Aggregate finalization, original reply/recovery, pending publication, immutable history and complete actor/agent fanout now use one full admitted `IEvaluatedCommand` with canonical `id`. Its fixed shape has 16 columns. The four embedded context repetitions are removed; ordered union variants, sparse `operationIndex`, explicit model versions and frozen external IDs remain.
2. Aggregate and Service share exactly `outcome: { result: Success | Failure, finalizedAt }`. Hashing uses only `outcome.result._tag` within the unchanged ordered preimage. Aggregate uses one transaction sample for source model writes, final outcome and subsequent projection model application. The approved amendment removes the timestamp from selected history/pending publication entirely; `command.outcome.finalizedAt` remains the source application timestamp. External observations retain `externalOutcome.recordedAt`, and Service's separate resource/application timing is preserved.
3. The agreed Aggregate schema, methods, modules, locals, spans and errors use evaluated/admitted command terminology. Canonical `id` and full immutable input comparison preserve original/replay source release provenance. `AggregateVersionChain.appendEvaluatedCommands` checks bound Aggregate ID/name before immutable append while allowing the admitted release to differ from the evaluating release. Existing Workerd verification rejects a next-position foreign-owner command without changing retained history.
4. The four-project graph `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p @zerospin/core system-worker @zerospin/browser @zerospin/sdk --nxBail` passed **17 tasks**, including core/system-worker/browser/SDK builds/type checks and lint, and **27 Workerd tests across 6 files**. Log: `/tmp/plan200-quality-final.log`. After the final owner guard and existing-scenario assertion, the current system-worker graph passed all required source/test TypeScript, lint and **27 Workerd tests** again. Log: `/tmp/plan200-quality-complete.log`. There are 13 existing lint warnings and zero errors. Nx Cloud's workspace-access 401 is ancillary to successful local execution.
5. `node scripts/verify-plan140.mjs` passed all **13 contract acceptance groups**; `node scripts/verify-session-identity.mjs` passed all **6 identity/browser recovery groups**. Logs: `/tmp/plan200-plan140.log` and `/tmp/plan200-session-identity.log`. Existing scenarios prove full admitted input round trips, outcome shape/timestamp, mixed output/sparse replay indexes, exact replies before/after pending deletion, complete parent-derived external work, source/projection timestamp agreement, immutable contradictions and rollback. Prior unsupported decoder/runner-name failures were repaired. A recheck during concurrent queue API edits failed three fanout tests; the final graph passed against the updated source/callers.
6. Current AGENTS guidance, glossary, governing ADR amendments, module READMEs, architecture/pattern guidance, both affected findings and Plan 151 reflect the new model. Moved source links and architecture source metadata were reconciled. The existing declaration-only capture refreshed storage metadata without executing source modules or running Explorer verification. No new tests, fixtures, runners, configuration, compatibility paths or migration were created. No storage reset, provider call, commit, publication or deployment occurred. Concurrent materialization-head and queue lifecycle work was preserved.
7. Scoped formatting, whitespace, current documentation links/source ranges and the old-name/field scans passed. Changed fixed schemas require empty affected storage. Additional publication hash validation remains explicitly deferred and is not required work.
8. The projected-history amendment deletes the timestamp column from `aggregateProjectedCommandsTable`, shared by retained actor/agent history and pending projection publication, and removes its `commitProjectionTx` parameter and caller/writer plumbing. Existing checks assert both schemas contain neither `executionStartedAt` nor `finalizedAt`; immutable selected-row contradictions use canonical `id`. Source `command.outcome.finalizedAt` still drives model application and source/projection timestamp agreement. The scoped system-worker graph passed all **9 tasks**, including **27 Workerd tests across 6 files**, and the acceptance runner passed all **13 groups**. Logs: `/tmp/plan200-projected-history-quality.log` and `/tmp/plan200-projected-history-plan140.log`. Current docs and declaration-only schema metadata match the deletion; no Explorer verification was run.

## Remaining work

None.
