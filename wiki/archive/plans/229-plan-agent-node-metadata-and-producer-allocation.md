# Agent node metadata and retained-command producer allocation

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 as superseded by completed [Plan 249](249-plan-aggregate-agent-backend-node.md) and [Plan 151](../../plans/151-plan-storage-table-review.md). No browser Agent producer/journal/private-recovery work remains. This retires the former design; it does not claim its old checklist passed.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Agent session replica.nodeMetadata](../../reviews/storage-tables/agent-session-replica-agent-delivery-metadata.md). **Related:** superseded [Plan 227](227-plan-agent-replica-canonical-command-rows.md) and [Plan 228](228-plan-agent-replica-two-column-checkpoint.md); current observer scope is governed by Plan 249/151. [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md) provides lifecycle context; existing ADRs and machinery do not constrain this cleanup.

## Archival disposition — 2026-10-26

The maintainer approved archival on 2026-10-26. Current browser Agent Nodes retain selected materialization checkpoints, not the removed producer/journal/private-recovery design. Applicable observer physical-context reviews remain with [Plan 151](../../plans/151-plan-storage-table-review.md); independent Actor, Service and Native work is unchanged. The design and implementation descriptions below are historical.

## Current disposition — 2026-10-23

Completed [Plan 249](249-plan-aggregate-agent-backend-node.md) removes browser Agent command journals, optimistic staging, producer allocation and private completion recovery. Current AggregateAgentNode/ServiceAgentNode storage retains only the selected checkpoint and resources; current runtime evidence is recorded in completed [Plan 257](257-plan-direct-system-worker-verifications.md). [Plan 151](../../plans/151-plan-storage-table-review.md#remaining-work) owns remaining current observer context/verification and the review gate. Older “active/unverified” related-plan labels and verification instructions below refer to the superseded snapshot; they do not require verifying removed machinery.

**Historical record:** The design and written-outcome notes below retain their original snapshot; the current disposition above governs supersession and remaining work.

## Problem and ownership

Agent producer metadata duplicates allocated command positions in nextPushIndex and uses a constant singletonId without enforcing singleton cardinality. Its current name, agentDeliveryMetadata, also hides the producer role. The Agent session acts as the producer node, and this table records its admission progress.

1. **nodeMetadata: producer admission progress.** Rename the Agent browser-owned table and composition property from agentDeliveryMetadata to nodeMetadata. Retain only admittedThroughPushIndex, the producer prefix known admitted by AggregateChain. This aligns the name with AggregateNode.nodeMetadata and ServiceNode.nodeMetadata while preserving each owner's independent schema and lifecycle.
2. **sessionMetadata: replica materialization progress.** Keep Agent's aggregateIndex/dispositionChainHash resource checkpoint separate. Resource snapshots may replace that checkpoint; they must not reset the producer's admission progress.

## Agreed decisions

1. Declare nodeMetadata with exactly one required integer column, admittedThroughPushIndex. Remove singletonId, its primary key and every associated predicate. Remove stored nextPushIndex and its increment/decrement plumbing. Add no replacement key, identity field, counter, timestamp, status, per-command acknowledgement or compatibility table/property.
2. Seed exactly one `{ admittedThroughPushIndex: 0 }` row when openAgentReplica creates the fresh in-memory database and captured producer sessionId. Do not reseed on reconnect, snapshot recovery or resource replacement. Add a focused readAgentNodeMetadataTx reader for the actual database/transaction context that requires exactly one row, rejecting absence or ambiguity. Every ordinary producer metadata reader/mutator, including pending selection and publication, must enforce that invariant before using or updating the row. Do not silently repair missing state or update an ambiguous singleton.
3. Derive allocated producer progress as `max(non-null commands.pushIndex) ?? 0`. Centralize this query in readAgentPushIndexTx; it returns the allocated maximum, not an eagerly computed successor. Final exposure preserves producer coordinates, snapshots retain commands and foreign final-only commands have null pushIndex. No new pruning or restoration lifecycle is introduced.
4. Allocate a new command's pushIndex as allocated maximum plus one inside the same synchronous transaction that rereads the canonical pending command and assigns its position. Preserve exact id/sessionIndex/phase/payload/stagedAt correlation, positive safe-integer validation and the existing requirement that the new position's successor is safe. Already assigned retries reuse their exact coordinate before entering the new-allocation exhaustion branch. Use the allocated maximum directly for publication and equivalent existing allocated-prefix bounds; do not make valid retries, receipts or recovery depend on allocating another position.
5. Retain admittedThroughPushIndex independently of allocation and finalization. An uncertain transmission must retry its assigned position; an exact AggregateChain admission receipt permits later submissions while exposure is pending. Preserve exact receipt/producer/command correlation, late receipts after final exposure, final-proof promotion, pending ordering/filtering and the contiguous committedOutcomeIndex used for resume. A validated earlier expectedPushIndex may still rewind admission progress subject to allocated bounds and retained-final contradiction checks. Do not replace receipt-only progress with a command maximum or make the mismatch-recovery cursor unconditionally monotone.
6. Keep proven unadmitted, unfinalized refusal as one synchronous rewind/delete/compact/replay transaction. Preserve originating-command ownership, matching pushIndex, admission and retained-final contradiction checks. Remove only the redundant allocator decrement: deleting the refused command and shifting later pending positions changes the retained maximum itself. A failed transaction must roll back command positions, resource changes and current inverseOperations together.
7. Publish Agent pushIndex as the allocated maximum, including zero for empty producer history. Update openAgentReplica.publishMetadata and makeAggregateAgentCommandJournal.publish accordingly. Update connectAgentSession to publish committed progress when commands change as well as when nodeMetadata/sessionMetadata change; allocation/refusal no longer writes a separate allocator row. Preserve existing explicit publication where needed, observer provenance and Scope/current-attempt/current-capability fences. Notifications must expose committed state without changing socket admission ownership.
8. Replace the explicit agentDeliveryMetadata authored-model reservation in makeAggregateAgentRelease with nodeMetadata, so an Agent model cannot collide with the renamed table. Check the other internal keys against the Agent-owned agentSessionRepoDbConfig instead of the superseded Aggregate schema dependency. Remove the obsolete reservation and old consumer names outright. The Agent remains a direct producer with its existing command journal; this naming alignment adds no AggregateNode/ServiceNode append journal or runtime.
9. Keep Agent's eleven-column commands model, two-column sessionMetadata, real protocol producer sessionId, identity/privacy checks and lifetime behavior unchanged. Keep Aggregate/Service replica storage, AggregateNode/ServiceNode tables and their consumers/guards, Native storage/guards and backend storage unchanged. Changed fixed Agent schemas require empty affected storage, with no aliases, migration, fallback decoder, automatic reset, deployment or commit.
10. After implementation, reconcile module READMEs, glossary, existing ADR 003 and affected architecture/pattern prose with the actual ownership and names. Update the finding and Plan 151 without completing another table review. Adapt actual existing in-scope assertion/seed consumers if found; create no tests, fixtures, runners or configuration. All verification, including documentation and preservation checks, remains deferred.

## Alternatives and rationale

1. Keeping nextPushIndex retains a second copy of positions already retained on commands. There is no independent reservation or high-water lifecycle: final exposure/snapshots preserve those positions, and refusal removes/compacts them atomically. Transactional allocation from commands removes the duplicate fact.
2. Deriving admittedThroughPushIndex from allocated positions would treat uncertain transmissions as admitted. Deriving it only from finalized commands would lose receipt-only admission progress while exposure is pending. Retain this independent cursor.
3. Putting admission progress on sessionMetadata would couple producer lifetime to replaceable resource snapshots. Keep the producer admission row separate and name it nodeMetadata. A constant SQL key neither identifies the producer nor proves exact singleton cardinality; use explicit cardinality checks instead.

## Implementation sequence

1. Replace the browser declaration/property and seed, add the exact-singleton reader and retained-maximum query, and update the Agent declaration collision reservation together.
2. Update allocation, receipt reconciliation, prefix promotion/mismatch recovery and refusal in their existing transaction boundaries. Remove obsolete key/counter reads and writes while preserving admission, retry, ownership and rollback behavior.
3. Update publication and change notifications for command-owned allocation progress. Preserve reconnect/resume semantics and the separation between admission, contiguous private finalization and public materialization.
4. Update actual existing consumers/assertions without running them, then reconcile the documentation and record written implementation separately from verification. Keep AggregateNode.nodeMetadata as Plan 151's next table review; this cleanup does not review that occurrence.
5. Keep this plan active. Resolve and record the scoped checks below only when verification deferral ends; archive after implementation and all required checks pass.

## Planned file hierarchy

`+` creates; `~` modifies. Direct consumer discovery may adjust affected existing files within this scope. Preserve unrelated work.

```text
zerospin/
  packages/browser/src/
    agentSession/
      ~ agentReplicaDbConfig.ts
      + readAgentNodeMetadataTx.ts
      + readAgentPushIndexTx.ts
      ~ openAgentReplica.ts
      ~ nextAgentSubmissionTx.ts
      ~ reconcileAgentAdmissionTx.ts
      ~ rejectAgentSubmissionTx.ts
      ~ makeAggregateAgentCommandJournal.ts
      ~ connectAgentSession.ts
    makeBrowserSession/
      ~ README.md
  packages/core/src/
    agent/
      ~ makeAggregateAgentRelease.ts
    agentSession/
      ~ README.md
  scripts/
    ~ actual existing in-scope assertion/seed consumers if any (unrun)
  wiki/
    ~ glossary.md
    ~ adrs/003-immutable-node-command-history-and-submission-order.md
    ~ affected existing architecture/pattern prose
    plans/
      + 229-plan-agent-node-metadata-and-producer-allocation.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ agent-session-replica-agent-delivery-metadata.md
```

## Verification seams — deferred

1. When deferral ends, inspect the affected Nx task configuration and use the smallest existing core/browser and direct-consumer seams with required dependencies. Establish the physical/property rename, sole required column, new authored-model reservation, removed obsolete reservation, exact singleton rejection and seed-once behavior. Do not create verification infrastructure or verify Explorer.
2. Establish sequential transactional allocation, retained positions through exposure/snapshots, empty-history allocation/publication, exact retry without reallocation, current safe-successor ceiling and valid retries at exhaustion. Establish refusal of the only/last command, later-position compaction and rollback of positions/resources/inverses on failure. Use the retained maximum directly wherever no new allocation is required.
3. Establish uncertain transmission retry versus receipt-before-exposure progress, exact and late receipt correlation, final-proof promotion, mismatch rewind and retained-final contradiction refusal. Preserve private contiguous resume progress, bound identities and lifecycle fences. Establish publication after allocation/refusal/command changes and resource checkpoint replacement without admission reset.
4. Complete scoped formatting/documentation/link/citation/frontmatter/whitespace and obsolete-reference checks, source-range/hash refresh, independent implementation review and storage-preservation comparisons. Keep Agent commands/sessionMetadata, Aggregate/Service/Native/Node storage and other active plans' evidence separate. Current source reading and this plan provide no passing verification.

## Implementation outcome — unverified

Agent browser composition and the physical table now use nodeMetadata, with only required admittedThroughPushIndex and no primary key, singletonId, stored nextPushIndex or replacement state. openAgentReplica explicitly seeds one zero-prefix row once per fresh producer/database lifetime. readAgentNodeMetadataTx requires exactly one row for ordinary access and mutation, rejecting missing or ambiguous state. Producer state remains outside replaceable sessionMetadata/resources and keeps the captured protocol producer identity.

readAgentPushIndexTx reads the retained maximum commands.pushIndex, with zero for empty/all-null producer history. nextAgentSubmissionTx rereads the canonical pending command and maximum inside its existing synchronous assignment transaction. An assigned coordinate is reused before the new-allocation branch; new allocation keeps positive/safe-integer/safe-successor checks. Receipt validation, prefix promotion, mismatch recovery and refusal use equivalent allocated bounds without depending on a newly computed successor. Refusal still rewinds, deletes, compacts later pending coordinates and replays survivors atomically; no duplicate allocator update remains.

Admission receipts retain their exact row/position/active-submission checks and late-final behavior. Receipt/final-proof promotion remains distinct from validated mismatch rewind and from the contiguous private outcome prefix. The journal's obsolete metadata forwarding method is removed; focused readers own actual singleton and allocated-maximum queries. Publication reads the singleton and materialization checkpoint and publishes the allocated maximum directly. Command, nodeMetadata and sessionMetadata change notifications publish committed progress, with existing explicit allocation/admission/refusal publication and lifetime/current-attempt fences retained.

makeAggregateAgentRelease reserves nodeMetadata and reads Agent internal keys from agentSessionRepoDbConfig, removing the obsolete name reservation and Aggregate checkpoint-schema dependency. Actual consumer discovery found no affected existing Agent replica assertion/seed/script consumer outside the changed production files. Existing script nextPushIndex assertions and nodeMetadata fixtures belong to AggregateNode/ServiceNode and remain unchanged. No new test, fixture, runner or configuration is created.

Both module READMEs, ADR 003, glossary, focused existing architecture/pattern prose, the recorded finding and Plan 151 describe the written result. Agent commands/sessionMetadata and Aggregate/Service/Native/Node storage/guards remain outside the schema change; preservation comparisons are unrun. Empty affected Agent storage is required without compatibility paths or automatic reset. No reset, migration, deployment or commit occurs.

No typecheck, lint, test, build, acceptance, formatting, documentation/link/citation/frontmatter/whitespace check, obsolete-reference check, source-range/hash refresh, independent implementation review or storage-preservation comparison ran. Source discovery and code/documentation writing are not passing verification. No additional owner/table review is completed; AggregateNode.nodeMetadata remains next.

## Remaining work

None under this archived plan.
