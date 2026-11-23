# Six-column ServiceNode metadata and derived command progress

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 by maintainer-approved consolidation into [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md). Its surviving correctness and verification requirements remain unfinished there. This is consolidation, not verified completion of this plan or its former storage representation.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [ServiceNode.nodeMetadata](../../reviews/storage-tables/service-node-node-metadata.md). Active [Plan 230](230-plan-aggregate-node-derived-progress-and-checkpoint.md), [Plan 231](231-plan-aggregate-node-normalized-command-history.md) and earlier unfinished implementations retain their independent status. [ADR 003](../../adrs/003-immutable-node-command-history-and-submission-order.md) provides context; its existing representation does not constrain this cutover.

## Archival disposition — 2026-10-26

Maintainer-approved consolidation on 2026-10-26 retires this independent checklist. [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#consolidated-verification-obligations) owns the surviving requirements under current Node/session-replica representations; [Plan 151](../../plans/151-plan-storage-table-review.md) tracks that work. Earlier implementation descriptions, storage formats and verification seams below are historical and do not authorize restoring removed representations or tooling.

## Problem and agreed model

ServiceNode stores allocator/completion copies derivable from its retained original/final commands. It also stores initialized beside a zero/genesis checkpoint that initially represents no installed resources. Keep independent durable facts, represent checkpoint absence directly and derive progress within the existing transaction boundaries.

1. Keep physical nodeMetadata with exactly six fields: required nodeId, sessionKey, admittedThroughPushIndex and pushPaused; nullable serviceIndex and dispositionChainHash. Remove id, initialized, nextNodeIndex, nextPushIndex and stored outcomeIndex. Add no replacement key, readiness flag, owner copy, timestamp or allocator. Keep ServiceNode.commands storage unchanged.
2. Provision exactly one durable producer row with its generated nodeId, complete bound-identity fingerprint, zero admission, false pause and both checkpoint fields null. Both-null means no committed baseline; both-present means a valid installed checkpoint, including index zero. Reject partial or invalid pairs. Ordinary reads/mutations require exactly one row; absence is allowed only for fresh provisioning and must not silently recreate producer state.
3. Preserve nodeId before initial authentication. Install validated initial resources and the present checkpoint pair atomically, requiring absent checkpoint, empty retained journal, zero admission and baseline resolvedThrough=0. New originals and final application require readiness; initialize(create=false) must still reject incomplete storage. Remove the prebaseline genesis sampling used only to fabricate a checkpoint.
4. Derive greatest commands.nodeIndex and greatest nonnull commands.pushIndex, default zero. Allocate each necessary successor inside the original/final append transaction, after exact duplicate handling and before writes. Preserve existing safe-integer/safe-successor bounds and retry behavior at exhaustion. Original and final rows share Node order; only originals consume producer order. No individual pruning or coordinate compaction is introduced.
5. Derive outcomeIndex as the contiguous original pushIndex prefix with same-canonical-ID retained final evidence. Start at zero and stop at the first gap or unresolved original. Neither maximum final producer position nor serviceIndex is equivalent. Baselines require resolvedThrough=0 and full replacement clears this generation's journal, so no private prefix needs a separate cache.
6. Expose derived nodeIndex, pushIndex and outcomeIndex at top level in ServiceNode snapshots, separate from actual SQL metadata. Capture them coherently with resources/checkpoint under the existing gate/transaction. Update publication, subscription bounds, admission-rewind bounds and snapshot consumers directly, without compatibility metadata projections.
7. Retain independent receipt-only admittedThroughPushIndex, final-proof promotion and validated mismatch rewind with retained-final contradiction checks. Keep full identity/claims/fingerprint, producer-generation, expected-Node, current-attempt and capability/privacy checks. Admission, private final coverage and Service materialization remain distinct facts.
8. Preserve whole-generation connected reset: acknowledgment barriers outside SQLite; atomically rotate nodeId, clear commands/resources, install captured resources/checkpoint, reset admission and clear pushPaused; resume with the same verified binding. Keep serialized SQL, rollback and close/drain boundaries. ServiceNode has no standalone same-owner/definition-drift exception and needs no extra owner column.
9. Update shared validateNodeSnapshotReconciliation capture resolution to select Aggregate/Service from actual metadata checkpoint fields. Both families now use inclusive top-level snapshot.nodeIndex. Keep one small public interface and internal capture/coverage/receipt/unresolved/known-retention procedures. Preserve existing validation before projection replacement without adding a protocol family discriminator or touching Aggregate storage.
10. Advance only ServiceNode's fixed-schema guard from 15 to 16. Changed fixed storage requires empty affected storage. Add no migration, compatibility decoder/alias, automatic-reset path, reset invocation, deployment or commit. AggregateNode guard 17 and Aggregate/Service/Agent replicas, Agent producer storage and Native storage/guards remain independently owned and unchanged by this schema cutover.
11. Update actual direct browser/replica consumers and existing assertion/seed code without running them or creating tests, fixtures, runners or configuration. Reconcile affected READMEs, glossary, existing ADR 003 and focused architecture/pattern prose. Record written implementation separately from verification in this plan, the finding and Plan 151; ServiceNode.commands remains the next table review.

## Implementation sequence

1. Replace the ServiceNode metadata schema; introduce focused singleton/checkpoint-presence, retained-maxima and contiguous-private-prefix readers. Update provisioning, baseline installation, original/final append, pause/admission recovery, state/snapshot/subscription and reset together.
2. Update shared snapshot capture and actual connected browser/replica/startup/resume consumers to checkpoint presence and top-level progress. Preserve prebaseline authentication and private/public recovery boundaries. Adapt existing assertions directly, without creating verification infrastructure.
3. Reconcile module documentation, ADR/glossary and focused architecture/pattern prose with the written result. Record this implementation without advancing the next table or treating another active plan as verified.
4. Keep all verification deferred, including formatting, documentation and preservation checks. Resolve later in-scope failures when verification resumes; archive only after all required checks pass.

## Planned file hierarchy

`+` creates; `~` modifies. Direct-consumer discovery may adjust affected existing files within scope.

```text
zerospin/
  packages/core/src/
    ServiceNode/
      ~ serviceNodeTables.ts
      + readServiceNodeMetadata.ts
      + hasServiceNodeCheckpoint.ts
      + readServiceNodeIndexes.ts
      + readServiceNodeOutcomeIndex.ts
      ~ ServiceNode.ts
      ~ acceptServiceOriginalTx.ts
      ~ retainServiceFinalTx.ts
      ~ README.md
    Node/
      ~ validateNodeSnapshotReconciliation.ts
    serviceSession/
      ~ initializeServiceNodeProjection.ts
      ~ README.md
  packages/browser/src/
    ServiceNode/
      ~ makeServiceWorkerRuntime.ts
      ~ ServiceNodeSynchronization.ts
    Node/
      ~ nodeRpcErrorFor.ts
    sessionReplica/
      ~ makeServiceReplicaReceiver.ts
    makeBrowserSession/
      ~ README.md
  wiki/
    ~ glossary.md
    adrs/
      ~ 003-immutable-node-command-history-and-submission-order.md
    ~ affected existing architecture/pattern prose
    plans/
      + 232-plan-service-node-derived-progress-and-checkpoint.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ service-node-node-metadata.md
```

## Verification seams — deferred

1. When deferral ends, inspect scoped existing Nx configuration and run the smallest relevant core/browser/direct-consumer tasks with required dependencies. Establish six-field/no-key metadata, guard 16, exact singleton rejection, both-null/present checkpoint validity, prebaseline nodeId, incomplete reopening refusal, valid zero baseline and atomic initial resources/checkpoint rollback. Do not create verification infrastructure or verify Explorer.
2. Establish transactional original/final allocation, exact retry at exhaustion, safe successor bounds, first-gap private outcome derivation and baseline checkpoint beyond local history. Preserve receipt-only admission versus uncertain allocation, final-proof promotion and mismatch rewind contradiction/current-attempt checks.
3. Establish coherent snapshots/subscription capture and shared family selection, private/public resume/replay, bound identity/claims/privacy, whole-generation replacement, pause intent/connected clearing, attachment reset barriers and close/drain/rollback behavior. Keep evidence for other active implementations separate.
4. Complete deferred formatting/documentation/link/citation/frontmatter/whitespace/obsolete-reference checks, source-range/hash refresh, independent implementation review and storage-preservation comparisons. Source reading and code/doc writing are not passing verification.

## Implementation outcome — unverified

ServiceNode.nodeMetadata now declares the six agreed fields without a SQL key, initialized flag or copied allocation/completion state. readServiceNodeMetadata requires exactly one row and a valid both-null or complete present checkpoint pair. hasServiceNodeCheckpoint narrows readiness without another stored fact. Provisioning keeps a durable nodeId/fingerprint/admission/pause row with an absent checkpoint and no fabricated genesis sample; initial resources/checkpoint commit atomically and incomplete reopening still fails.

readServiceNodeIndexes derives append/producer maxima, and both immutable append phases allocate their required successors within the existing transaction after exact retry handling. readServiceNodeOutcomeIndex derives the canonical-ID-correlated contiguous original producer prefix, stopping at the first gap. Cached allocator/outcome writes are removed. Independent admission receipts, final-proof promotion and validated mismatch rewind retain their roles, with bounds derived from retained producer positions.

ServiceNode snapshots expose nodeIndex/pushIndex/outcomeIndex at top level beside actual six-field metadata. State/subscription/capture/admission/reset consumers use these derived facts. Pause mutation checks singleton presence within its transaction; connected reset still replaces one generation/resources/checkpoint atomically, clears admission/pause and preserves the verified storage binding. Existing gate, close/drain, attachment reset acknowledgement and current-attempt boundaries remain.

The connected browser runtime and synchronization, core Service projection initializer and browser Service replica receiver now consume checkpoint presence and snapshot-level progress. Shared snapshot validation identifies owner family from metadata checkpoint fields and uses inclusive snapshot.nodeIndex for both families, preserving its internal domain procedures. Browser snapshot RPC error handling retains typed singleton/checkpoint failures. Existing identity-script assertions consume snapshot-level progress without execution. ServiceNode guard is 16; no migration, new reset path or reset invocation is added. Other storage/guards remain outside this change; preservation comparisons are unrun.

Affected existing READMEs, ADR 003, glossary and focused architecture/pattern prose are reconciled with the written model. The finding and Plan 151 record approved written implementation separately from verification; ServiceNode.commands remains next. No test, fixture, runner or configuration file is created. No typecheck, lint, test, build, acceptance, formatting, documentation/link/citation/frontmatter/whitespace/obsolete-reference check, source-range/hash refresh, independent implementation review or storage-preservation comparison ran. Writing code/docs provides no passing verification, and no active plan is archived.

## Remaining work

None under this archived plan.
