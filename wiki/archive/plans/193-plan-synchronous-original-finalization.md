# Synchronous original finalization and outcome receipts

**Date:** 2026-10-15

**Status:** Completed and verified on 2026-10-15.

**Implementing-chat authorization:** The maintainer requested implementation of this plan. The original planning request authorized documentation only; this implementation request authorized the source cutover and existing verification seams.

**Outcome:** AggregateChain now synchronously retains the complete original finalization reply. The dispatch flag and reverse outcome protocol are removed; AggregateVersionRepo recovers duplicate outcomes from pending publication or permanent AggregateVersionChain history. [ADR 014](../../adrs/014-synchronous-original-finalization.md) governs this protocol.

**Parent:** [Plan 151 — storage table review](../../plans/151-plan-storage-table-review.md), specifically the [AggregateChain.commands finding](../../reviews/storage-tables/aggregate-chain-commands.md).

**Related:** [Research](../../research/aggregate-chain-outbox-and-replay-subscriptions.md), [completed Plan 189](189-plan-aggregate-command-execution-resolution.md), [completed Plan 190](190-plan-aggregate-delivery-history-and-projection-ownership.md), [ADR 005](../../adrs/005-ordered-original-execution-and-finalized-replay.md), [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md), active [Plan 191](191-plan-zerospin-result-and-outcome-types.md) and [Plan 192](192-plan-activation-materialization-catchup.md).

## 1. Problem and agreed protocol

Before implementation, AggregateVersionRepo committed original finalization synchronously before returning its execution packet. `finalizeCommandRows` reduced that packet to command ID/position, while a separate `finalizedOutcomeOutbox` delivered the original `commandOutcome` back to AggregateChain. The split created `originalDispatchAcknowledged`, reverse outcome delivery, remote pending-outcome proof and a second recovery loop. [Finalization reply after implementation](../../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommandRows.ts), [Original delivery after implementation](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L131-L258).

Use the returned committed outcome to complete original delivery:

1. AggregateChain selects the oldest admitted command with `commandOutcome === null` and sends it to the AggregateVersionRepo selected by its retained `aggregateVersion`.
2. AggregateVersionRepo either commits fresh original execution or recovers that command's committed execution packet. It returns `{ commandId, aggregateIndex, commandOutcome }`.
3. AggregateChain validates the reply and synchronously retains the first original `commandOutcome` on its command row. The row leaves pending original delivery and remains authoritative admitted history.
4. AggregateVersionRepo publishes its complete execution packet to AggregateVersionChain independently. Original-result return does not await publication; duplicate recovery may need history after publication has removed the local packet.

**Remove `AggregateChain.commands.originalDispatchAcknowledged` and the entire AggregateVersionRepo `finalizedOutcomeOutbox` protocol.** Keep admitted history, the existing execution checkpoint, complete publication packets and permanent AggregateVersionChain history. Add no replacement result cache, original-outcome queue, acknowledgement field, history table, fingerprint or retry counter.

This supersedes Plan 151's smaller proposal to keep the flag and normalize it when an independently delivered outcome arrives. The maintainer selected the single-request protocol; do not re-request that design decision during implementation. The subsequent implementing-chat request authorized this agreed protocol.

## 2. Durable state and acknowledgement rules

| Owner / retained fact                              | Agreed meaning and lifetime                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AggregateChain.commands.commandOutcome`           | Null means original outcome still required. Non-null means AggregateChain durably recorded original Success or public Failure. Keep the command row after completion.                                                                                        |
| `AggregateVersionRepo.executionCheckpoint`         | Existing singleton with `singletonId`, `aggregateIndex`, `commandId`, `dispositionHash`. Advances atomically with local resources and complete publication output. It establishes committed local progress, not every historical command ID or result value. |
| `AggregateVersionRepo.aggregateVersionChainOutbox` | Complete original/replay execution packet, including the exact recorded outcome. Delete only after AggregateVersionChain commits or recognizes the identical packet.                                                                                         |
| `AggregateVersionChain.executionHistory`           | Permanent release-local execution packets and outcomes after pending publication deletion. Never delete this history to acknowledge publication.                                                                                                             |

[Current checkpoint/publication transaction](../../../packages/system-worker/src/AggregateVersionRepo/utils/retainEvaluatedCommandTx.ts), [checkpoint read](../../../packages/system-worker/src/AggregateVersionRepo/readAggregateCheckpoint.ts), [existing result recovery](../../../packages/system-worker/src/AggregateVersionRepo/readEvaluatedCommand/readEvaluatedCommand.ts#L31-L68).

AggregateVersionRepo atomically commits resource changes or a retained public refusal, its checkpoint, the complete publication packet and any permitted original external work. Removing the outcome outbox must not weaken business-savepoint rollback or leave output detached from its resource commit. Replay continues to use its receiving release's program and never produces original external requests.

The returned finalization value contains the complete canonical `commandOutcome`, including the original `recordedAt`. Preserve canonical codecs and inference rather than copying an obsolete success/failure union into the new reply. Plan 191 may change the outcome representation; this protocol retains the domain field and exact recorded value without selecting another representation or changing `dispositionHash` coverage.

## 3. Duplicate finalization and concurrent execution

Use the existing checkpoint and execution packets; do not add AggregateVersionRepo history.

1. Validate the bound aggregate owner, designated original release and positive safe aggregate position. Preserve exact admitted-input/command-ID association checks against AggregateChain's immutable input; a supplied command ID or a lower position alone is not sufficient proof of identity.
2. Read the local execution checkpoint **before predecessor catch-up or fresh contract/release lookup**. For `command.aggregateIndex <= checkpoint.aggregateIndex`, recover the committed packet and return its outcome. No contract evaluation, recording-time sample, resource mutation or external-operation production is allowed on that branch.
3. Recovery first reads `aggregateVersionChainOutbox`. If its packet has been acknowledged and removed, read the exact position from this AggregateVersionRepo's AggregateVersionChain. Validate the recovered command ID/position and retained input association before returning the original outcome. Share existing authoritative-input reads where practical; do not reconstruct input from compact output. Missing/conflicting history is an explicit failure, never permission to execute again.
4. For a position above the checkpoint, catch up this release through N−1 outside its execution permit. Under the existing execution permit, recheck the checkpoint **before fresh declaration resolution**, because another request may have committed while catch-up awaited. If it is now committed, leave the permit and recover the result. Only the still-fresh branch resolves the bound execution release and enters the existing synchronous materialization transaction. Keep its transactional checkpoint/contiguity recheck as well.
5. Run AggregateVersionChain and AggregateChain identity/result RPCs outside every SQL transaction and execution permit. Do not hold local execution exclusivity across history recovery, source catch-up, publication or external requests.

The existing [duplicate branch](../../../packages/system-worker/src/AggregateVersionRepo/utils/readAggregateCommandTx.ts#L28-L49) and [result/input identity checks](../../../packages/system-worker/src/AggregateVersionRepo/validateCommandIdentity.ts) supply the current responsibilities. [Implemented finalizeCommand](../../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommand.ts#L41-L108) reads the checkpoint before predecessor catch-up, rechecks it under the execution permit before declaration lookup, and recovers committed results outside that permit. The preimplementation flow performed catch-up and lookup too early; this cutover removes that ordering without another execution mode or forwarding layer.

This does not add retired-release activation support. The resource-owning AggregateVersionRepo still needs its authored release to construct its database schema. Early duplicate handling removes unnecessary execution-time lookups; it does not remove that constructor requirement. Plan 189's ability to replay supported definitions without the admitted release remains separate.

## 4. AggregateChain completion, order and recovery

Keep `finalizeCommandOutbox`, its one-command page and the existing receiving RPC capability. Change the reply to carry the complete original outcome. No new public execution RPC or second completion interface is required.

- `hasPending` and bounded `readPage` select only `commandOutcome IS NULL`, in ascending `aggregateIndex` order. Eliminate the Boolean/null coupled state and the separate original-outcome drain.
- Replace `acknowledgeOriginalDispatch` with a synchronous original-finalization acknowledgement. Decode the complete reply; require exactly one selected position and one matching command ID/position. Match the reply to the retained command and its designated AggregateVersionRepo chosen by the sender. Keep schema validation, first-outcome immutability and exact outcome comparison, including `recordedAt`.
- In the acknowledgement transaction, recheck retained identity and finalized predecessor before writing the outcome. An identical retained retry is idempotent; a contradictory reply fails without replacing the first value. The bound RPC reply establishes original-executor authority. It does not require a reverse `getPendingFinalizedOutcome` proof.
- A public refusal is a returned `commandOutcome` and completes delivery. Transport errors, interruption, defects, malformed replies or acknowledgement-transaction failures leave the outcome null and preserve delivery recovery. Do not encode those failures as a command refusal.
- `executeCommandsThrough(N)` captures its existing bounded position, drains this outbox through N and verifies completion through N. Remove its `drainOriginalOutcomes` callback/loop; the outbox now records outcomes before selecting later originals. Keep direct execution's Chain-local recovery of an already recorded original outcome.

**Preserve durable replay wake-up when removing the reverse subscriber.** The existing finalization-outbox alarm is armed before delivery and remains armed through acknowledgement and `afterAcknowledge`. Use that completion hook to acquire/release the existing replay fanout producer lease, durably arming and waking replay before finalization recovery is released. Keep the queue wrapper's recovery behavior that reruns the completion hook even when no original rows remain pending. A crash after outcome commit but before replay wake must therefore recover through the still-armed original-delivery alarm. Add no new queue hook, scheduler or state table merely to replace the deleted callback. [Existing completion-hook recovery](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L327-L340), [existing replay producer lease](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L306-L330).

Replay still exposes only the contiguous prefix with non-null original outcomes. Each release evaluates that input independently and may retain a different local outcome. This plan does not remove replay subscribers or make an original reply acknowledge AVC publication, projection delivery or external work.

## 5. Remove the superseded protocol outright

Implementation owns these directly affected paths:

- **AggregateChain:** remove the Boolean from [schema](../../../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts), admission defaults and existing seeded rows; replace `acknowledgeOriginalDispatch`; delete `receiveFinalizedOutcomes`, `finalizedOutcomeSubscriber`, `#drainOriginalOutcomes` and their exclusive imports/errors. Convert queue wiring and [executeCommandsThrough](../../../packages/system-worker/src/AggregateChain/executeCommandsThrough/executeCommandsThrough.ts) to returned-outcome completion.
- **AggregateVersionRepo:** remove the outcome table from [schema](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts) and its insertion from [retainAggregateResultTx](../../../packages/system-worker/src/AggregateVersionRepo/utils/retainEvaluatedCommandTx.ts). Delete `#finalizedOutcomeOutbox`, `drainFinalizedOutcomeOutbox`, `getPendingFinalizedOutcome` and the original-outcome producer wrapper. Keep the publication/external recovery leases that still own real outgoing messages. Return the three-field finalization from [finalizeCommandRows](../../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommandRows.ts) and reorder duplicate handling in [finalizeCommand](../../../packages/system-worker/src/AggregateVersionRepo/finalizeCommand/finalizeCommand.ts).
- **Shared interfaces:** remove reverse-outcome methods from [AggregateChains](../../../packages/system-worker/src/repoServices/AggregateChains.ts) and [AggregateVersionRepos](../../../packages/system-worker/src/repoServices/AggregateVersionRepos.ts). Delete `IOriginalDispatchReceipt`; use the existing three-field shape as the finalization reply, named `IAggregateCommandFinalization` and owned with that procedure instead of the AVC publication module. Remove `IFinalizedOutcome` if its sole remaining role is that renamed reply; add no compatibility alias. Preserve the existing receiving capability and ordinary RPC envelope conventions.
- **Inspection and evidence:** update affected existing schema assertions, admission profile seeds/snapshots and permitted verification seams. Refresh Explorer schema capture, table purposes and architecture edges after actual source changes; remove the reverse outcome edge. Update relevant module READMEs, glossary, local patterns and execution architecture workflows. Do not change Service finalization or introduce corresponding Service owners by analogy.

Keep parent Plan 151 active. Its current table inventory remains a source snapshot until implementation removes the table/column; do not mark replacement table reviews or runtime checks complete during planning.

## 6. Interruption and availability contract

| Interruption / failure                                                              | Required recovery                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AggregateVersionRepo transaction fails before commit                                | No false checkpoint/resource/output progress; AggregateChain remains pending and may execute the command on retry.                                                                           |
| AggregateVersionRepo commits; reply is lost                                         | AggregateChain retries the same identity. AggregateVersionRepo recovers the stored packet without evaluating again.                                                                          |
| Publication has not reached AggregateVersionChain                                   | Recover the exact outcome from the complete local publication packet.                                                                                                                        |
| Publication committed and its local packet was deleted                              | Recover from AggregateVersionChain's retained history. Sender deletion must follow durable AVC acknowledgement, leaving no missing-result interval.                                          |
| AggregateVersionChain is unavailable after local packet deletion                    | Leave AggregateChain pending, preserve the already committed AggregateVersionRepo checkpoint, and retry recovery later. Never evaluate again or recreate external work to obtain a reply.    |
| Reply arrives; AggregateChain acknowledgement fails or is interrupted before commit | Retry the same finalization; AggregateVersionRepo returns the same outcome/time.                                                                                                             |
| AggregateChain commits; replay wake is interrupted                                  | Original-delivery recovery remains armed until its completion hook transfers recovery to replay. Recover even with no remaining pending originals.                                           |
| Duplicate requests overlap or an old request arrives after later progress           | Check/recheck ordered checkpoint and recover the exact historical command association. Preserve first outcome; do not confuse the checkpoint's latest command ID with an older request's ID. |

The maintainer selected recovery from existing publication/history instead of an additional local result cache. The resulting AggregateVersionChain availability dependency is part of this design. It does not justify retaining the deleted outcome outbox as a fallback. First execution can return its committed packet while AVC publication is unavailable; historical duplicate recovery can require AVC once the local packet has drained.

## 7. Coordination, storage and governing documents

- **Plan 191:** preserve canonical `commandOutcome` and its recorded timestamp through the outcome-type cutover. Update actual codecs/consumers together; this plan does not decide another success tag, add telemetry to durable outcomes or change disposition-hash algorithms.
- **Plan 192:** startup establishes publication/external recovery and performs bounded already-finalized catch-up. Remove original-outcome recovery responsibilities when this protocol lands. Startup must not await pending original finalization, AVC publication or a callback into its own activation gate. A local execution checkpoint can still exceed AggregateChain's finalized prefix after a lost finalization reply.
- **ADRs:** record the agreed original-completion decision in the next suitable ADR during implementation and update ADR 005/013 references with precise supersession. Supersede only the split original-outcome/dispatch protocol; ADR 013's resource/history separation, complete independent publication/fanout messages, projections, privacy and external-work ownership continue to govern. Preserve completed Plans 189/190 as historical implementation records.
- **Hard cutover:** removing the Chain column and AggregateVersionRepo table changes fixed schemas. Require empty affected AggregateChain and AggregateVersionRepo storage; add no translation, legacy reader, fallback queue or dual completion path. No reset, deployment, vendor propagation or new test/fixture/runner/configuration files are authorized. Preserve unrelated WIP and recheck concurrent source before implementation.

## 8. Verification and completion

Use the smallest meaningful existing checks. Relevant seams are verify-plan140 (`scripts/verify-plan140.mjs`, removed 2026-10-17), Workerd activation/restart coverage (`packages/system-worker/test/migratable-do-repo/system-repo-activation.workerd.spec.ts`, removed 2026-10-17), existing admission profiles (`packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommands.profiles.ts`, removed 2026-10-17) and their snapshots (`packages/system-worker/src/AggregateChain/admitAggregateCommands/admitAggregateCommands.profiles.spec.ts`, removed 2026-10-17). Keep exactly one representative success and one rejection profile; do not create an outcome/error catalogue or new test infrastructure.

- [x] Return and retain original Success and public Failure; match ID/position and reject contradictory/malformed receipts without false Chain completion.
- [x] Prove rollback/interruption before AVR commit and failure of the Chain acknowledgement after AVR commit. Later originals wait for Chain retention of the preceding original outcome.
- [x] Prove lost-reply recovery both from a pending publication packet and, after publication/deletion and restart, from AVC history. Preserve exact result/refusal and `recordedAt`, resource effects and original external-work production counts.
- [x] Prove unavailable/missing/conflicting history never causes reevaluation or false progress; recovery succeeds after AVC availability returns. Wrong owner/version/ID/position remains rejected.
- [x] Prove overlapping duplicates and replay cannot execute the same original twice. Preserve transactional checkpoint checks and RPC outside SQL/execution permits.
- [x] Prove replay wake recovery after Chain outcome commit, including failure of the completion hook and a restart with no pending original rows. Keep background publication and external work independent of the returned original outcome.
- [x] Update existing physical schema assertions, seeds and RPC bindings; search in-scope current source for removed table/flag/method/type names. Historical evidence may retain its original spellings.
- [x] Inspect current Nx projects/targets, then run scoped system-worker type/lint/Workerd typecheck and applicable existing runtime checks. Include directly affected consumers only; do not broaden to unrelated WIP. Refresh and check Explorer if its schema/architecture artifacts change.
- [x] Reconcile governing docs, Plan 151/finding status and actual table inventory; record real verification and remaining limits. Archive this plan only after implementation and required verification finish.

## Implementation and verification outcome

- AggregateChain retains the exact returned Success or public Failure, validates the one-row reply and finalized predecessor in its acknowledgement transaction, and wakes replay through the existing producer lease. Admitted history remains retained.
- AggregateVersionRepo validates fresh admitted input before catch-up, checks/rechecks the existing checkpoint before declaration resolution, and returns exact local-publication or AVC-history outcomes without reevaluation. Identity/history RPCs remain outside SQL and execution permits. Publication and original external work keep their own recovery.
- Removed `originalDispatchAcknowledged`, `finalizedOutcomeOutbox`, reverse RPCs/types and their seeds/bindings. Updated fixed-schema absence assertions and refreshed Explorer (12 concrete Repos, 58 table declarations), ownership evidence, ADRs and workflow docs. Affected AggregateChain and AggregateVersionRepo storage must be empty; no reset or deployment was performed.
- `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker` passed: six test files, 27 tests, including the existing success/rejection admission profiles and Workerd activation/restart coverage.
- `node scripts/verify-plan140.mjs` passed all ten groups. The synchronous-finalization scenario covers precommit interruption/rollback, fresh input refusal, exact Success/public Failure, lost-reply local/history recovery with a reconstructed SQLite handle and execution semaphore, acknowledgement rollback, identity/malformed/conflicting replies, AVC unavailability/missing/conflicting history, overlapping duplicate/replay execution, ordered original completion, unchanged resource/external-production rows, and completion-hook interruption/recovery with no pending originals. Existing external-operation scenarios cover independent live request recovery.
- `pnpm nx run explorer:check`, scoped formatting, source/schema scans and `git diff --check` passed. Nx Cloud reported unavailable workspace access (401); local tasks completed successfully.

## Remaining work

None.
