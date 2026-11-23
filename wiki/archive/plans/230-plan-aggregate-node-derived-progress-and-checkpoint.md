# Seven-column AggregateNode metadata and derived command progress

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 by maintainer-approved consolidation into [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md). Its surviving correctness and verification requirements remain unfinished there. This is consolidation, not verified completion of this plan or its former storage representation.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [AggregateNode.nodeMetadata](../../reviews/storage-tables/aggregate-node-node-metadata.md). Active [Plan 229](229-plan-agent-node-metadata-and-producer-allocation.md) and earlier unfinished plans retain their independent status. [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md) and [ADR 004](../../adrs/004-standalone-authority-and-storage-scope.md) provide context; old machinery does not constrain this cutover.

## Archival disposition — 2026-10-26

Maintainer-approved consolidation on 2026-10-26 retires this independent checklist. [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#consolidated-verification-obligations) owns the surviving requirements under current Node/session-replica representations; [Plan 151](../../plans/151-plan-storage-table-review.md) tracks that work. Earlier implementation descriptions, storage formats and verification seams below are historical and do not authorize restoring removed representations or tooling.

## Problem and agreed model

AggregateNode stores command-derived allocation/completion caches and a separate initialized flag alongside a seeded checkpoint that does not yet represent installed resources. Retain independent durable facts and derive progress from the retained journal at the owning transaction boundary.

1. Keep the physical nodeMetadata table with exactly seven fields: required nodeId, aggregateId, sessionKey, admittedThroughPushIndex and pushPaused; nullable aggregateIndex and dispositionChainHash. Remove id, initialized, nextNodeIndex, nextPushIndex and stored outcomeIndex, with no replacement key, allocator, status, timestamp or identity object.
2. Provision one durable row with captured identity, generated producer nodeId, zero admission prefix, false pause and both checkpoint fields null. Both-null means no committed baseline; both-present means a valid materialized checkpoint, including zero/genesis. Reject partial or invalid pairs. Keep nodeId available for authentication before baseline installation; require exactly one row for ordinary reads/mutations, rejecting absence/ambiguity rather than repairing producer state.
3. Install initial baseline resources and the present checkpoint pair atomically. Initial installation requires unready state, empty command allocation, zero admission and resolvedThrough=0. Ordinary new original admission and final application require a present pair. Reopening with create=false must still refuse incomplete storage. Remove genesis sampling used only to fabricate a prebaseline checkpoint.
4. Derive Node and producer maxima from retained commands.nodeIndex and nonnull commands.pushIndex, default zero. New original/final append computes its required successor within the existing gated append transaction. Preserve safe-integer/safe-successor ceilings and exact duplicate returns before new-allocation exhaustion checks. Use maxima directly for publication/subscription/recovery bounds where no allocation is required.
5. Derive outcomeIndex as the contiguous original pushIndex prefix with canonical-ID matching retained finals, starting at zero and stopping at the first gap. Preserve the protocol fact while removing its SQL cache. Baselines require resolvedThrough=0 and whole-generation replacement clears commands, so no private prefix exists outside retained generation history. Never substitute maximum finalized position or Aggregate resource position.
6. Expose derived nodeIndex, pushIndex and outcomeIndex as top-level AggregateNode snapshot fields, separate from the seven-field metadata row. Preserve current state progress and derive snapshots/subscription positions within the existing coherent resource/checkpoint transaction. Update actual consumers directly; add no fake SQL columns, compatibility metadata projections or fallback decoders.
7. Keep exact producer generation, Aggregate owner and retained fingerprint checks, including standalone same-owner refusal before replacement permits definition/lock drift. Preserve receipt-only admission, final-proof promotion, validated mismatch rewind/retained-final contradiction checks, privacy, current-attempt/capability fences and append ordering. Admission, private finalization and public materialization remain distinct.
8. Whole baseline replacement still rotates nodeId, clears journal/resources, installs the baseline and resets admission atomically. Derived maxima/outcome then restart at zero. Standalone reset preserves explicit pause; connected reset clears it. Preserve acknowledged attachment reset barriers, SQL gate/rollback and close/drain behavior. No individual command pruning or coordinate compaction is introduced.
9. Advance only the AggregateNode fixed-schema guard from 15 to 16. Changed fixed storage requires empty affected storage; no migration, alias, dual path, automatic-reset addition, reset invocation, deployment or commit. Keep ServiceNode guard/storage, Native replica guard/storage, Aggregate/Service/Agent replica storage and Agent producer metadata unchanged.
10. Update host/direct consumers and actual existing assertions/seeds without running them or creating tests, fixtures, runners or configuration. Reconcile module READMEs, glossary, ADRs 003/004 and affected existing architecture/pattern prose after implementation. Record written implementation separately from verification in this plan, the finding and Plan 151; AggregateNode.commands remains the next table review.

## Implementation sequence

1. Replace the metadata schema and add focused singleton/checkpoint-presence, maximum-index and contiguous-outcome readers. Update provisioning, baseline installation, original/final append, admission recovery, pause, snapshot/subscription/state and reset together.
2. Update connected browser, standalone, Native and direct replica consumers to the nullable pair and top-level progress. Keep prebaseline authentication and private/public resume proofs intact. Adapt existing assertion/seed consumers with owner-specific Service branches unchanged.
3. Reconcile affected documentation and record the unverified result. Discover direct consumers as needed while preserving unrelated work; complete no additional storage-table review.
4. Keep every required verification step deferred, including formatting/documentation/preservation checks. Archive only when verification is later authorized and all required checks pass.

## Planned file hierarchy

`+` creates; `~` modifies. Direct consumer discovery may adjust affected existing files within scope.

```text
zerospin/
  packages/core/src/AggregateNode/
    ~ aggregateNodeTables.ts
    + readAggregateNodeMetadata.ts
    + hasAggregateNodeCheckpoint.ts
    + readAggregateNodeIndexes.ts
    + readAggregateNodeOutcomeIndex.ts
    ~ AggregateNode.ts
    ~ acceptAggregateOriginalTx.ts
    ~ retainAggregateFinalTx.ts
    ~ README.md
  packages/core/src/aggregateSession/
    ~ initializeAggregateNodeProjection.ts
  packages/browser/src/
    ~ AggregateNode/ affected snapshot/startup/synchronization consumers
    ~ StandaloneNode/ affected baseline/snapshot consumers
    ~ sessionReplica/ affected Aggregate consumers
    ~ makeBrowserSession/README.md
  packages/native/src/
    ~ affected Aggregate Node/replica consumers and existing documentation
  scripts/
    ~ actual existing assertion/seed consumers (unrun)
  wiki/
    ~ glossary.md
    ~ adrs/003-immutable-node-command-history-and-submission-order.md
    ~ adrs/004-standalone-authority-and-storage-scope.md
    ~ affected existing architecture/pattern prose
    plans/
      + 230-plan-aggregate-node-derived-progress-and-checkpoint.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ aggregate-node-node-metadata.md
```

## Verification seams — deferred

1. When deferral ends, inspect affected scoped Nx tasks and run the smallest existing core/browser/Native/direct-consumer seams with required dependencies. Establish seven-field/no-key storage, guard 16, explicit singleton rejection, prebaseline node identity and both-null/both-present validity, incomplete reopen refusal and atomic initial baseline/rollback. Never verify Explorer or create verification infrastructure.
2. Establish original/final transactional allocation, exact retries at exhaustion, safe bounds, first-gap private outcome derivation, receipt-only admission versus uncertain allocation, mismatch rewind contradictions and coherent snapshot/subscription/resume/replay progress. Establish zero-index baseline readiness and captured baseline positions beyond local command history.
3. Establish whole-generation replacement and old-capability refusal, standalone same-owner/definition-change boundaries, pause preservation versus connected clear, reset acknowledgement barriers and close/drain/rollback behavior. Compare unchanged Service/Agent/Native replica storage and independent guards without treating other active plans as verified.
4. Complete formatting/documentation/link/citation/frontmatter/whitespace and obsolete-reference checks, source-range/hash refresh, independent implementation review and storage-preservation comparisons. Source reading and writing are not passing verification.

## Implementation outcome — unverified

AggregateNode.nodeMetadata now declares exactly the seven agreed fields, with no SQL key, initialized flag or copied allocation/completion state. readAggregateNodeMetadata requires exactly one row and accepts only a both-null or complete valid checkpoint pair. hasAggregateNodeCheckpoint narrows the present pair without a second stored readiness fact. Provisioning keeps producer identity/owner/fingerprint and zero admission/false pause while storing no checkpoint. Initial baseline resources and the validated present pair commit together; ordinary new original/final/execution paths require readiness and incomplete reopening still refuses absent baseline.

readAggregateNodeIndexes derives Node/producer allocated maxima from retained commands, and append transactions allocate their successors after exact retry handling with the existing safe limits. Counter updates are removed. readAggregateNodeOutcomeIndex derives the contiguous original producer prefix using matching canonical-ID final evidence and the first-gap stop. Admission receipts/final promotion and validated mismatch rewind remain independent durable admission state; recovery bounds use the retained producer maximum without requiring another allocation.

Snapshots now expose nodeIndex, pushIndex and outcomeIndex at top level alongside the actual seven-field metadata row. State, subscription bounds, snapshot replacement and private/public socket resume consumers use committed derived progress. The obsolete private metadata forwarding method and key predicates are removed. Pause mutation and full replacement enforce singleton presence before changing state; whole-generation replacement still rotates nodeId, clears commands/resources, installs the checkpoint and resets admission atomically, preserving standalone pause and clearing connected pause. Existing SQL gate/transaction/close/reset-acknowledgement boundaries remain.

Connected browser, standalone, Native, direct Aggregate replica receivers and initializeAggregateNodeProjection consume checkpoint presence and the new progress locations. Prebaseline authentication still reads nodeId; standalone execution and replica/synchronization consumers require a checkpoint before resource use/publication. Exact owner/fingerprint and current-generation/attempt/capability checks remain. AggregateNode fixed-schema guard is 16. Changed storage requires empty affected storage without compatibility paths, migration or an added automatic-reset path; no reset, deployment or commit is performed.

Before the standalone script was removed, `scripts/verify-session-identity.mjs` consumers were updated without execution, including existing prebaseline/seven-field/guard seams, Aggregate progress assertions and the unsupported-layout fixture. Owner-specific Service branches keep their model. No test, fixture, runner or configuration file is created. Affected existing READMEs, ADRs 003/004, glossary and focused architecture/pattern prose are reconciled. Agent/Service/Native replica storage and independent guards remain outside the schema change; comparisons are unrun.

No typecheck, lint, test, build, acceptance, formatting, documentation/link/citation/frontmatter/whitespace check, obsolete-reference check, source-range/hash refresh, independent implementation review or storage-preservation comparison ran. Code and documentation writing provide no passing verification. Plan 151 still points to AggregateNode.commands; no additional table review is completed.

## Follow-up consumer repair — Plan 231, unverified

The AggregateNode.commands source review found that shared validateNodeSnapshotReconciliation still read removed metadata.nextNodeIndex. Approved [Plan 231](231-plan-aggregate-node-normalized-command-history.md) now has that consumer repair written: capture reads Aggregate's inclusive snapshot.nodeIndex and present checkpoint, preserves Service's safe exclusive metadata.nextNodeIndex bound, and resolves family differences once behind the existing interface. Internal procedures separately validate requested coverage, captured receipts, unresolved commands and known retention before resource replacement. This repairs the observed wiring omission without claiming verification of either plan. Plan 231 also advances the subsequent AggregateNode command schema guard to 17; this plan's version-16 cutover remains historical context.

## Remaining work

None under this archived plan.
