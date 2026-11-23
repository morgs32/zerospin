# Eleven-column Agent command rows and pending-state settlement

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 as superseded by completed [Plan 249](249-plan-aggregate-agent-backend-node.md) and [Plan 151](../../plans/151-plan-storage-table-review.md). No browser Agent producer/journal/private-recovery work remains. This retires the former design; it does not claim its old checklist passed.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Agent session replica.commands](../../reviews/storage-tables/agent-session-replica-commands.md). Prior Aggregate/Service implementation plans remain independently unverified.

## Archival disposition — 2026-10-26

The maintainer approved archival on 2026-10-26. Current browser Agent Nodes retain selected materialization checkpoints, not the removed producer/journal/private-recovery design. Applicable observer physical-context reviews remain with [Plan 151](../../plans/151-plan-storage-table-review.md); independent Actor, Service and Native work is unchanged. The design and implementation descriptions below are historical.

## Current disposition — 2026-10-23

Completed [Plan 249](249-plan-aggregate-agent-backend-node.md) removes browser Agent command journals, optimistic staging, producer allocation and private completion recovery. Current AggregateAgentNode/ServiceAgentNode storage retains only the selected checkpoint and resources; current runtime evidence is recorded in completed [Plan 257](257-plan-direct-system-worker-verifications.md). [Plan 151](../../plans/151-plan-storage-table-review.md#remaining-work) owns remaining current observer context/verification and the review gate. Older “active/unverified” related-plan labels and verification instructions below refer to the superseded snapshot; they do not require verifying removed machinery.

**Historical record:** The design and written-outcome notes below retain their original snapshot; the current disposition above governs supersession and remaining work.

## Problem and agreed behavior

Agent replicas inherit twenty-column Aggregate commands and two physical phases despite receiving no Node original/final coordinates. The direct Agent protocol already binds identity and contract versions. Give Agent storage the facts its lifecycle needs without retaining copied context, unused encoded staging results or a second command row.

1. Declare exactly eleven Agent command columns: sessionIndex, id, commandName, payload, pushIndex, stagedAt, inverseOperations, failure, exposedDelta, aggregateIndex and dispositionChainHash. Keep sessionIndex primary key; require unique canonical id and unique non-null aggregateIndex. Remove both partial phase-id indexes and the unused Node-coordinate index. Keep the physical table name commands.
2. Remove six SQL bound-identity copies, contractVersion and nodeId/nodeIndex. Reconstruct complete admitted-command input from the immutable Agent lifetime/session definition, canonical commandName/payload and real pushIndex. The captured local sessionId remains the protocol producer nodeId. Preserve exact Aggregate/Agent/session identity and selected contract-version checks; never use a newer session definition or mutable UI values for retained input.
3. Store stagedAt from the existing successful local completedAt sample, without resampling. Keep initial resource writes and pending replay on that time. Preserve result codec validation and the synchronous public stage return, including its decoded staging result; do not store encoded stagingOutcome.result or an empty outcome wrapper. Current model-bound inverses remain separate mutable pending state, with null for inactive optimism and an empty array for applied no-op optimism.
4. Use one row per canonical ID. A new local stage allocates one stable sessionIndex inside its transaction; a matching final enriches that row without allocation. A previously unseen exposed command inserts one final-only row. Compare final commandName/index/hash/failure/delta exactly on retry and preserve aggregate-position occupancy/continuity checks.
5. On final exposure, rewind optimism, apply selected resources/checkpoint, merge final fields and clear payload/stagedAt/inverseOperations in the same synchronous transaction, then replay remaining pending input. Foreign finals have no pending state or local pushIndex. Empty delta and null failure still settle the command. Admission acknowledgement must not mark exposure, clear pending state or settle optimism.
6. Preserve producer semantics. Assign pushIndex once with producer allocation and reuse it for uncertain retry. Retain ID/push/final evidence after exposure; prefix scans include settled producer rows. Late admission receipts must still validate after final exposure. Refuse only a genuine local unfinalized/unadmitted pending submission; keep admitted/finalized contradiction checks, atomic rewind/delete/allowed producer compaction/replay and once-only private failure observation. Pending becomes aggregateIndex-null, without phase anti-joins.
7. Keep snapshot/reconnect identity and complete private-prefix recovery, resource/checkpoint atomicity, covered-final non-reapplication, contiguous streamed final application and existing reset/disposal behavior. Reject a regressed snapshot or equal-position hash conflict before mutation: retained exact final rows must not make an older resource base appear current. Reconnect reuses the same in-memory replica. Do not prune settled producer/final proof or introduce a new reset, persistence or TTL feature.
8. Keep Aggregate and Service physical storage unchanged, including their command phases/Node coordinates and their current metadata models. Keep Agent sessionMetadata and agentDeliveryMetadata shapes unchanged for their separate reviews. Keep AggregateNode/ServiceNode guards 15 and Native replica guard 5 unchanged. Fixed schema changes require empty affected Agent storage with no migrations, aliases, fallback decoders, dual paths, automatic reset, deployment or commit.
9. Update Agent consumers, existing assertions and affected README/ADR/glossary/architecture/pattern documentation. Create no test, fixture, runner or configuration files. Keep all verification deferred, including tests/types/lint/build/acceptance, formatting/documentation/link/citation/frontmatter/whitespace, obsolete-reference checks, independent implementation review and storage-preservation comparisons. Never verify Explorer.

## Implementation sequence

1. Add a core Agent-owned command schema and focused insertion/allocation, rewind/replay, final import and snapshot procedures. Reuse meaningful contract evaluation, model codecs/inverses and synchronous savepoints without adapting Agent rows back into the superseded Aggregate SQL shape. Route Agent staging to its own writer; preserve the public result and Aggregate staging behavior.
2. Compose the Agent schema with unchanged Agent delivery metadata and shared four-field sessionMetadata. Update replica initialization, pending/submission reconstruction, final-page import, admission/prefix/rejection queries and origin observation together. Keep immutable bound lifetime context available when the public capability is withheld.
3. Adapt affected existing assertion/seed/profile consumers without running them. Update relevant module and architecture documentation, existing ADRs, glossary, the recorded finding and Plan 151. Agent session replica.sessionMetadata remains next; do not complete another table review.
4. Record implementation outcome and deferred checks below. Keep the plan active and archive only after required verification is later authorized and passes.

## Planned file hierarchy

`+` creates; `~` modifies. Necessary direct consumer discovery may adjust this bounded hierarchy. Preserve existing unrelated work.

```text
zerospin/
  packages/core/src/
    agentSession/
      + agentSessionRepoDbConfig.ts
      + allocateAgentSessionIndexTx.ts
      + readAgentSessionMetadataTx.ts
      + stageAgentSessionCommandTx.ts
      + rewindAgentOptimismTx.ts
      + replayPendingAgentCommandsTx.ts
      + retainAgentCommandTx.ts
      + importAgentCommands.ts
      + applyAgentSessionSnapshot.ts
      + README.md
    aggregateSession/stageCommand/
      ~ stageAggregateSessionCommand.ts
      ~ affected Agent/ordinary staging dispatch
    agent/
      ~ affected session capability types if needed
  packages/browser/src/
    agentSession/
      ~ agentReplicaDbConfig.ts
      ~ openAgentReplica.ts
      ~ makeAggregateAgentCommandJournal.ts
      ~ nextAgentSubmissionTx.ts
      ~ reconcileAgentAdmissionTx.ts
      ~ rejectAgentSubmissionTx.ts
      ~ connectAgentSession.ts
    ~ affected bootstrap/capability consumers and README.md files
  scripts/
    ~ affected existing Agent assertions/seeds (unrun)
  wiki/
    ~ glossary.md
    ~ affected existing ADR/architecture/pattern prose
    plans/
      + 227-plan-agent-replica-canonical-command-rows.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ agent-session-replica-commands.md
```

## Verification seams — deferred

1. When deferral ends, inspect current scoped Nx configuration and run affected core/browser and actual Agent consumer type/lint/test tasks with required dependencies, plus existing Agent session/admission/snapshot/identity/replay seams. Never verify Explorer. Keep other active plans' evidence separate.
2. Establish eleven-column/one-ID constraints, canonical version/context reconstruction, unchanged synchronous result validation/API, stable stagedAt, compact undo semantics, no-op/inactive inverses, and rollback of stage/final/resource/checkpoint/replay failures. Establish new-stage/new-foreign-final allocation and no new position on merge/duplicate.
3. Establish pending-to-final field clearing, final equality/gap/hash/position refusal, covered recovery, complete snapshot private prefix and foreign-final privacy. Establish regressed/equal-conflicting snapshot refusal before mutation. Establish admission-before/final-before-admission ordering, uncertain retry, late exact receipts, contiguous outcome prefix over settled rows and refusal contradiction/producer compaction behavior using existing seams.
4. Complete formatting/documentation/link/citation/frontmatter/whitespace and obsolete-reference checks, source-range/hash refresh, independent implementation review and storage-preservation comparisons, including Aggregate/Service commands, Agent metadata and Node/Native guards. Resolve in-scope failures and archive only after all required checks pass.

## Implementation outcome — unverified

Agent persistence now lives in core/agentSession. Its commands table declares the
eleven approved fields with sessionIndex primary key, unique canonical id and
unique non-null aggregateIndex. No phase or Node-coordinate indexes remain in
the Agent release. Browser composition uses these Agent commands alongside
unchanged four-field sessionMetadata and three-field agentDeliveryMetadata.
Aggregate and Service physical storage retain their own declarations.

stageAggregateSessionCommand dispatches Agent work to stageAgentSessionCommandTx,
which reuses the checked evaluator and synchronous savepoint. Result validation
and the public decoded staging result remain; SQL stores only the existing
completedAt sample as stagedAt with pending payload/current inverses. Allocation
reads the indexed retained maximum inside insertion SQL with safe bounds. Full
admitted input reconstructs from the immutable session definition/captured owner and
lifetime, selected canonical contract version, retained ID/name/payload and real
pushIndex. No old-shaped SQL adapter, encoded staging result, per-row identity or
unused Node coordinate is retained.

retainAgentCommandTx/importAgentCommands enforce canonical name/final equality,
Aggregate-position occupancy, hash and contiguous application checks. Exposure
enriches an existing canonical row without allocation or inserts one final-only
row. It preserves local position/pushIndex and clears payload/stagedAt/inverses
atomically with selected resources/checkpoint before pending replay. Empty delta
and null private failure still settle the input without disclosing canonical
outcome.result.\_tag. Admission acknowledgement remains a separate producer fact
and keeps pending replay state.

Browser journal queries use merged-row state rather than phase anti-joins.
Settled producer rows retain ID/push/final proof for contiguous recovery and late
admission receipts, including a valid late receipt after another submission has
become pending. Exact allocated-prefix/current-pending checks remain for actual
unfinalized work. Refusal locates and validates the originating pending row inside
its synchronous transaction, rejects admitted/finalized contradictions and
atomically rewinds/deletes/compacts allowed later producer positions/replays.
Foreign finals never create originating failure proof; ID/name, current-attempt
and lifetime fences preserve private once-only observation.

Agent rewind uses reverse local application and operation order through shared
compact model inverses. Pending replay preserves stagedAt, resolves the exact
bound contract, validates the new result without retaining it and regenerates
current inverses. Expected business/dependency refusal leaves null applied undo;
successful no-op keeps an empty array. applyAgentSessionSnapshot validates exact
bound identity, resource codecs, complete private recovery count/IDs/positions and
covered producer correlation before mutation. It rejects checkpoint regression
or equal-position hash conflict before replacing resources, preventing retained
exact finals from hiding an older resource base. Snapshot resource/checkpoint
replacement, current-inverse clearing, covered-final merge and pending replay
share one transaction. No older-base reset/fallback or history-pruning feature is
added.

Core/browser consumers, a new Agent module README, affected existing READMEs,
ADR 003, glossary, architecture/pattern prose, the finding and Plan 151 record the
written change. Necessary bounded discovery found no existing script/assertion/
profile/seed consumer of this Agent browser replica command storage, so no
unrelated server Agent tests or fixtures were changed and no new test/fixture/
runner/configuration was created. Agent session replica.sessionMetadata remains
next; no additional owner/table review is completed.

Aggregate/Service storage, Agent metadata shapes and Node/Native guards were
outside these edits; preservation comparisons remain unrun. Empty affected
Agent storage is required without migrations, compatibility aliases, fallback
decoders or automatic reset. No deployment or commit occurs. No typecheck, lint,
test, build, acceptance, formatting, documentation/link/citation/frontmatter/
whitespace check, obsolete-reference check, independent implementation review or
storage-preservation comparison ran. Source ranges/hashes and inventory totals
are not refreshed or validated. No passing verification is claimed.

## Remaining work

None under this archived plan.
