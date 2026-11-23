# Eleven-column AggregateNode command history and snapshot validation

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 by maintainer-approved consolidation into [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md). Its surviving correctness and verification requirements remain unfinished there. This is consolidation, not verified completion of this plan or its former storage representation.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [AggregateNode.commands](../../reviews/storage-tables/aggregate-node-commands.md). **Related:** active [Plan 230](230-plan-aggregate-node-derived-progress-and-checkpoint.md), whose stale shared snapshot-validator consumer is included here. Other unfinished plans retain their independent verification status.

## Archival disposition — 2026-10-26

Maintainer-approved consolidation on 2026-10-26 retires this independent checklist. [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#consolidated-verification-obligations) owns the surviving requirements under current Node/session-replica representations; [Plan 151](../../plans/151-plan-storage-table-review.md) tracks that work. Earlier implementation descriptions, storage formats and verification seams below are historical and do not authorize restoring removed representations or tooling.

## Agreed model and behavior

1. Declare exactly eleven AggregateNode.commands columns: nodeIndex, id, pushIndex, commandName, payload, claims, stagingOutcome, failure, aggregateIndex, dispositionChainHash and exposedDelta. Remove stored aggregateId, aggregateName, aggregateVersion, sessionName and contractVersion. Replace origin JSON with complete per-original claims. Rename SQL delta to exposedDelta while preserving exposed-command transport delta.
2. Keep two immutable append phases with separate nodeIndex values and canonical id correlation. Preserve the primary key, unique nullable pushIndex/aggregateIndex and both partial original/final ID indexes. Originals retain input/claims/compact stagingOutcome for the generation even after final exposure. Finals retain complete selected delta, nullable private failure and Aggregate position/hash. Reject incoherent both/neither phase rows; add no phase discriminator, merged-row path or original-field clearing.
3. Reconstruct full originals from the retained row, current producer nodeId and captured bound Node definition. Derive Aggregate owner/release/session and Actor kind/name/version from that definition; derive exact source contract version from its pinned command entry. Preserve full wire Origin and all canonical command fields, rather than emitting a reduced protocol or compatibility alias.
4. Before retaining a new original, validate commandName membership/canonical registry name and incoming contractVersion against the exact bound lock, alongside existing owner/Actor/session and connected-claims or standalone-claims checks. Reject mismatch without writes. Exact canonical-ID retries compare complete reconstructed input before current blocked-work/new-allocation gates, including supplied fixed context, source version, original payload bytes, full claims and stagingOutcome. Never strip conflicting fields before comparison or silently adapt an unsupported source version.
5. Keep complete per-command claims, including empty records. Standalone attachments may share storage while using different valid claims; reconstructing from current attachment claims would change original execution authority. Keep compact stagingOutcome result/completedAt as the original local staging fact; it remains distinct from authoritative outcome and current replay inverses.
6. Update original reconstruction for paging, snapshots, nextPush, exact receipts and standalone execution. Keep foreign final-only command names valid without applying original-only contract membership restrictions. Preserve final equality/occupied positions/resource continuity, privacy, contiguous private prefix, admission receipts/rewind, transactional allocation, safe limits and retry ordering.
7. Fix validateNodeSnapshotReconciliation to read Aggregate's inclusive captured snapshot.nodeIndex while preserving Service's existing exclusive metadata.nextNodeIndex bound and safe-integer checks. Keep nullable Aggregate checkpoint readiness, current generation/receipt partition/private proof and pre-mutation rejection. Do not weaken Service validation or change Service storage/protocol.
8. Refactor that validator behind its single existing interface. The parent reads capture once, then calls internal validateRequestedCommandCoverage, validateCapturedReceipts, validateCapturedUnresolvedCommands and validateKnownCommandRetention procedures. readNodeSnapshotCapture resolves Aggregate/Service capture differences once; remaining rules consume that resolved capture. Keep every helper internal to the same file, with each owning its named invariant.
9. Advance only AggregateNode's schema guard from 16 to 17. Require empty affected fixed storage; add no migration, fallback decoder, dual schema, new automatic reset path or reset invocation. Keep seven-column Node metadata, Service/Agent storage, ServiceNode guard 15 and Native replica guard 5 unchanged. Preserve whole-generation reset/owner/fingerprint/pause/close/acknowledgement boundaries.
10. Adapt existing assertion/seed consumers without executing them or creating tests, fixtures, runners or configuration. Update affected module READMEs, existing ADRs 003/004, glossary and focused architecture/pattern prose. Record written implementation separately from verification in this plan, Plan 230, the finding and Plan 151; keep ServiceNode.nodeMetadata as the next review. No new table review, deployment or commit is included.

## Implementation sequence

1. Replace the schema and original/final readers/writers together, retaining phase shapes and full reconstruction/equality. Update class callers and schema guard.
2. Fix the shared snapshot capture bounds and organize its internal invariant helpers, retaining one public interface and owner-specific safety checks. Update actual direct consumers and existing assertions/seeds as needed.
3. Reconcile documentation and record implementation outcomes, including Plan 230's consumer repair. Preserve unrelated work and keep all verification deferred.
4. Resolve scoped checks only when deferral ends. Archive this plan only after implementation and required checks pass; earlier active plans retain their independent checks.

## Planned file hierarchy

`+` creates; `~` modifies. Necessary direct-consumer discovery may adjust affected existing files within scope.

```text
zerospin/
  packages/core/src/
    AggregateNode/
      ~ aggregateNodeTables.ts
      ~ readAggregateNodeRecord.ts
      ~ acceptAggregateOriginalTx.ts
      ~ retainAggregateFinalTx.ts
      ~ AggregateNode.ts
      ~ README.md
    Node/
      ~ validateNodeSnapshotReconciliation.ts
  packages/browser/src/
    ~ affected direct consumers if discovered
    ~ makeBrowserSession/README.md
  packages/native/
    ~ affected direct consumers if discovered
    ~ README.md
  wiki/
    ~ glossary.md
    ~ adrs/003-immutable-node-command-history-and-submission-order.md
    ~ adrs/004-standalone-authority-and-storage-scope.md
    ~ affected existing architecture/pattern prose
    plans/
      + 231-plan-aggregate-node-normalized-command-history.md
      ~ 230-plan-aggregate-node-derived-progress-and-checkpoint.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ aggregate-node-commands.md
      ~ aggregate-node-node-metadata.md
```

## Verification seams — deferred

1. When deferral ends, inspect scoped Nx tasks and run the smallest existing core/browser/Native/direct-consumer seams with required dependencies. Establish eleven columns, original/final shape/indexes, guard 17 and complete reconstructed originals with retained per-command claims/staging evidence. Never verify Explorer or create verification infrastructure.
2. Establish unknown/wrong source contract refusal before writes, canonical-ID changed-version/context/payload/claims/staging retry conflicts, exact retries before exhaustion and full original receipt recovery after final exposure. Preserve foreign finals, exposedDelta/wire delta mapping, final exact equality, private failure, resource/checkpoint/admission transactions and contiguous append/private progress.
3. Establish Aggregate capture maximum inclusion, empty capture, checkpoint presence and current-generation bounds; preserve Service exclusive safe next-index behavior. Establish complete unique requested-ID partition, original/final receipt ID/name/position checks, unresolved capture bounds and refusal to lose an already Node-retained original before resource mutation. Preserve reset/close/owner/pause fences.
4. Complete formatting/documentation/link/citation/frontmatter/whitespace and obsolete-reference checks, source-range/hash refresh, independent implementation review and storage-preservation comparisons. No passing verification is inferred from writing this change or repairing Plan 230's known consumer.

## Implementation outcome — unverified

AggregateNode.commands now declares exactly eleven columns with per-original claims and final exposedDelta. The five fixed context/version columns and full stored Origin envelope are removed, with no aliases or replacement state. All five primary/unique constraints remain. Original and final readers enforce their coherent phase fields; separate append rows and canonical-ID correlation retain original input/claims/compact stagingOutcome after final exposure. Encoded exposedDelta has the declared delta schema type and reconstruction maps it to the unchanged wire delta field.

readAggregateStagedCommand receives the captured Node definition and reconstructs full Aggregate/Actor/session identity and the pinned contract version while retaining each original's complete claims. The class's page/snapshot/receipt/nextPush/standalone consumers and exact original retry path pass that definition. New original admission requires an own selected contract entry with matching canonical name and exact incoming version, refusing mismatch before writes with node-command-contract-mismatch. Existing canonical-ID changed input remains node-command-input-conflict through full reconstructed comparison before new-admission/allocation gates. Foreign finals retain their actual names without original-only registry restrictions.

validateNodeSnapshotReconciliation retains one exported interface. Its parent reads capture, then invokes the four internal domain invariant procedures requested by the maintainer: requested-command coverage, captured receipts, captured unresolved commands and known-command retention. readNodeSnapshotCapture resolves Aggregate's inclusive snapshot.nodeIndex and present checkpoint or Service's safe positive exclusive metadata.nextNodeIndex/serviceIndex once. The remaining procedures consume resolved capture predicates/bounds, preserving generation/ID/name/position/private coverage and pre-resource-mutation refusal. Plan 230's stale Aggregate metadata.nextNodeIndex assumption is removed; Service's original safe-counter checks remain.

AggregateNode's fixed-schema guard is 17, with seven-field metadata unchanged. Before the standalone script was removed, `scripts/verify-session-identity.mjs` consumers were updated for eleven-field raw history, reconstruction, exact registry/version refusal and current guard; existing Service branches remain independent. Source discovery found no additional direct browser/Native decoder callers or external typed raw-row consumers needing changes. No test, fixture, runner or configuration file is created. Affected READMEs, ADRs 003/004, glossary and focused architecture/pattern prose describe the implemented representation and validator responsibilities.

Other owner storage/guards, transaction/identity/privacy/reset/pause/close fences and shared exposed-command protocol remain outside the cutover. Empty affected AggregateNode storage is required without migration, aliases, fallback decoder or an added reset path. No reset, deployment or commit occurs. Plan 230 records its consumer repair under this follow-up, while its verification status stays independent. ServiceNode.nodeMetadata remains Plan 151's next table review.

No typecheck, lint, test, build, acceptance, formatting, documentation/link/citation/frontmatter/whitespace check, obsolete-reference check, source-range/hash refresh, independent implementation review or storage-preservation comparison ran. All existing assertions remain unrun, and code/documentation writing is not passing verification.

## Remaining work

None under this archived plan.
