# Aggregate replica staging outcome and current inverses

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 by maintainer-approved consolidation into [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md). Its surviving correctness and verification requirements remain unfinished there. This is consolidation, not verified completion of this plan or its former storage representation.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Aggregate session replica.commands](../../reviews/storage-tables/aggregate-session-replica-commands.md). The subsequent discussion supersedes the finding's proposal to retain the old staging timestamp/name, separate optimism table and actorDelta name.

## Archival disposition — 2026-10-26

Maintainer-approved consolidation on 2026-10-26 retires this independent checklist. [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#consolidated-verification-obligations) owns the surviving requirements under current Node/session-replica representations; [Plan 151](../../plans/151-plan-storage-table-review.md) tracks that work. Earlier implementation descriptions, storage formats and verification seams below are historical and do not authorize restoring removed representations or tooling.

## Problem and agreed behavior

Aggregate replicas currently retain the original local result, two timestamps and unused initial speculative snapshots/forward operations in staging. Current undo state lives in a separate optimisticAppliedOperations table, and selected final changes use the actor-specific actorDelta name. The original result and the current undo state have different lifecycles but can share their owning command row. Remove the redundant output/table and name both facts directly.

1. Rename the Aggregate staging field/protocol to `stagingOutcome`, exactly `{ result, completedAt }`. The result remains the immutable original successful local return value. Local rejection retains no staged command. `completedAt` is the single logical successful staging timestamp reused for initial local resource writes and all pending replay; remove Aggregate startedAt, the second clock sample, stagedDelta snapshots and retained forward operations.
2. Add separate `commands.inverseOperations` containing only current local undo information. It is mutable replica-local state, excluded from stagingOutcome, Node input, immutable Node history, handoff equality and selected final output. Initially capture it with resource changes; each rebase rewinds and clears it, applies authoritative changes and replaces surviving commands' inverses in the same synchronous transaction. Settled commands and final rows retain no applied optimism. Preserve reverse command/operation order, full deleted resource restoration, previous updatedAt values, reference constraints and model-bound codecs.
3. Remove the Aggregate replica's physical `optimisticAppliedOperations` table and every Aggregate reader/writer/join/clear path. Store compact ordered undo records rather than the complete applied-forward-operation envelope. Preserve meaningful inverse validation and transaction rollback; add no replacement queue, side table, duplicate cache or compatibility path.
4. Rename Aggregate replica `actorDelta` to `exposedDelta`. It retains the selected authoritative final resource changes, distinct from local speculation and the canonical outcome. Keep the exposed-command transport's existing `delta` field where its containing type already establishes the exposed command. Preserve exact final retry, private failure filtering, contiguous checkpoints and covered/ahead recovery semantics.
5. Carry the compact `stagingOutcome` through all actual Aggregate consumers, including AggregateNode's immutable original input, connected/standalone browser handoff, Agent composition and Native persistence. Agent retains its real producer pushIndex. Node command input must never receive current inverse state. Keep complete per-command Origin/source contractVersion and current owner/session fields; the earlier four-context-column/pushIndex removal recommendations are not included in this approved change.
6. Keep Service physical storage and protocol unchanged. Its still-used staging schema must move to a Service-owned declaration rather than remain coupled to the removed Aggregate shape. This is an ownership split, not an old-format decoder or compatibility alias. Shared inspection UI must select the correct domain field names.
7. This is a pre-release fixed-schema/protocol hard cutover. Increment Aggregate Node and Native replica storage guards as needed so old storage refuses activation. Require empty affected storage; no migration, fallback decoder, aliases, old-format acceptance or automatic reset/data deletion. No deployment or commit.
8. Update existing consumers/assertions in place, including existing acceptance scripts and stories when affected. Create no test files, fixtures, runners or configuration. All verification, including tests, type/lint/build, formatting, documentation/citation checks, independent implementation review, obsolete-reference checks and storage-preservation comparisons, remains deferred.

## Implementation sequence

1. Establish compact Aggregate stagingOutcome and model-bound inverse representation; update the Aggregate replica schema, synchronous staging/evaluation, rewind/rebase, final import and snapshot/reset flows together.
2. Update Aggregate command types, Node storage/input/record readers and storage guards; move the Service staging declaration to its real owner with no shape change. Update browser/Agent/Native handoff, persistent guard and inspection consumers.
3. Adapt directly affected existing behavioral assertions and fixtures in place. Preserve coverage of atomic failure, original-result immutability, rebase replacement, inverse ordering, selected final settlement, retry and recovery without creating infrastructure or running checks.
4. Reconcile module documentation, affected ADR text, glossary, local naming guidance, the table finding and Plan 151 with the implemented result. Existing ADRs are context and documentation, not constraints that preserve superseded machinery. Record no unrelated table review.
5. Record written implementation and exact remaining deferred checks. Keep this plan active; archive only after required verification is later authorized and passes.

## Planned file hierarchy

`+` creates, `~` modifies, `-` removes or relocates. Direct consumer discovery may adjust existing files within this scope. Preserve unrelated working-tree edits.

```text
zerospin/
  packages/core/src/
    aggregateSession/
      + StagingOutcomeSchema.ts
      - StagingResultSchema.ts (Service-owned declaration replaces its Service use)
      + AggregateInverseOperationSchema.ts
      + encodeAggregateInverseOperation.ts
      + applyAggregateInverseOperationTx.ts
      ~ sessionRepoDbConfig.ts
      ~ evaluateAggregateSessionCommandTx.ts
      ~ rewindAggregateOptimismTx.ts
      ~ replayPendingCommandsTx.ts
      ~ applyOrderedAggregateOccurrencesTx.ts
      ~ initializeAggregateNodeProjection.ts
      ~ decodeRetainedAggregateSessionCommand.ts
      ~ AggregateActorCommandSchema/AggregateActorCommandSchema.ts
      ~ stageCommand/stageSessionCommandTx/stageSessionCommandTx.ts
      ~ applyAggregateSessionSnapshot/applyAggregateSessionSnapshotTx/applyAggregateSessionSnapshotTx.ts
      ~ README.md
    contracts/
      ~ types.ts
    AggregateNode/
      ~ aggregateNodeTables.ts
      ~ readAggregateNodeRecord.ts
      ~ AggregateNode.ts
      ~ README.md
    serviceSession/
      + ServiceStagingResultSchema.ts
      ~ existing staging-schema import consumers only
    ServiceNode/
      ~ ServiceNodeCommandInputSchema.ts (schema ownership import only)
  packages/browser/src/
    ~ affected Aggregate/Agent/standalone consumers and existing stories
    ~ bootstrapServiceSession.ts (Service schema ownership import only)
  packages/native/src/
    ~ openPersistentAggregateReplica.ts
    ~ affected Aggregate handoff consumers
  packages/devtools/src/sessions/sessions/sessionId/commands/
    ~ sessionsCommandsTableColumns.ts
  scripts/
    ~ affected existing verification scripts (unrun)
  wiki/
    ~ glossary.md
    ~ affected current ADR/naming/architecture guidance
    plans/
      + 223-plan-aggregate-replica-staging-outcome-and-inverses.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ aggregate-session-replica-commands.md
```

## Verification seams — deferred

1. When deferral ends, inspect current Nx configuration and run the scoped core/browser/native/devtools and affected consumer type/lint/test graph with required dependencies, plus the existing Aggregate session/Node/standalone/Agent acceptance seams. Never verify Explorer.
2. Establish that initial staging commits resources/outcome/inverses/allocator together; rejection and invalid inverse roll everything back; one logical completedAt is stable across replay; and original result/time never change when current inverse data changes.
3. Exercise create/update/delete/move undo, reverse ordering, reference restoration, rebase against a changed authoritative value, selected final settlement with empty delta/null failure, exact retry/conflict handling, snapshots, direct recovery and explicit reset. Confirm current inverses never cross Node/handoff boundaries.
4. Check affected existing storage guards reject old fixed Aggregate schemas without migration/reset. Compare unchanged Service schema/protocol and Agent producer responsibilities. These comparisons are unrun and cannot be inferred from source edits.
5. Complete deferred formatting/docs/link/citation/frontmatter/whitespace and obsolete-live-reference checks, independent implementation review and any source metadata refresh. Resolve in-scope failures before archival; do not absorb unrelated active plans' unfinished verification.

## Implementation outcome — unverified

Aggregate commands now own original stagingOutcome, separate nullable current
inverseOperations and selected final exposedDelta. The physical Aggregate
optimisticAppliedOperations table is removed. The current commands declaration
has twenty columns: the original nineteen with staging/exposed names changed,
plus inverses. Earlier bound-context and Actor pushIndex removal proposals remain
outside this implementation.

Aggregate evaluation samples one logical completedAt, encodes the original result,
applies emitted operations with that same timestamp and captures compact inverses.
The unused initial speculative inserted/updated/deleted snapshots, their resource
rereads, the retained forward-operation array and separate startedAt plumbing are
removed. Staging commits resource changes, original outcome, current inverses,
command identity and allocator together. Validation continues to use the same
savepoint with rollback always and retains none of these changes.

AggregateInverseOperationSchema, encodeAggregateInverseOperation and
applyAggregateInverseOperationTx own compact undo state. Records retain exact
model name/version, resource identity and original operation kind. Create needs
identity only; update/move retain previousUpdatedAt and a model-encoded inverse;
delete retains the deleted resource through its inverse codec. They do not copy
forward body, command ID, operationIndex or appliedAt. Rewind reads command-row
inverses in reverse command order and applies arrays in reverse order, then clears
them. Replay regenerates current inverses against the new authoritative baseline;
expected typed replay refusal leaves null, while successful no-op replay stores
an empty array. Original stagingOutcome remains unchanged.

Final rows retain no local inverses. Existing exact original/final equality,
coordinate enrichment, canonical ID settlement, contiguous cursor/checkpoint
advancement and covered/ahead recovery remain in the written procedures.
Duplicate staged receipts compare immutable outcome and enrich coordinates without
overwriting current inverse state. Both snapshot paths clear command-row inverses
before rebuilding resources/replaying pending input. Explicit reset still clears
history atomically under its existing authorization; this source change performs
no reset.

Aggregate ISessionCommand, SessionCommandSchema, AggregateNode storage/read/input,
and browser handoff carry only compact original stagingOutcome. Agent composition
inherits the Aggregate replica cleanup and retains its genuine pushIndex allocator.
Standalone execution does not consume staging evidence; its input schema follows
the same compact Aggregate shape. Native handoff follows SessionCommandSchema.
AggregateNode's fixed storage guard is 15 and Native Aggregate replica's is 4;
unsupported nonempty storage refuses activation without a translation path.

ServiceStagingResultSchema now lives under serviceSession with its former shape.
Actual Service consumers point there; Service's staging, actorDelta and separate
optimism storage remain independent. The removed shared Aggregate schema path has
no alias. Devtools selects domain-correct columns. The shared IActorDelta and
ActorDeltaSchema type/schema names and exposed-command wire delta field are not
renamed by this local-column cleanup.

Before removal, `verify-session-identity.mjs` assertions/seed consumers used the compact
Aggregate outcome, command-row inverse presence and Aggregate version-15 guard,
including version-14 rejection. Service seed/assertion branches retained their
existing shape. No additional test, fixture, runner or configuration file was
created. The standalone verification scripts have since been removed; those
assertions were never run.

Aggregate session/Node, browser and Native READMEs, ADRs 003/004, glossary, local
naming guidance and relevant current architecture sections describe the written
model. Existing source hashes/ranges and all documentation checks remain deferred.
The original storage finding is explicitly historical and records this approved
unverified implementation separately. Plan 151 removes the retired optimism table
from the pending physical queue and points next to sessionMetadata; no additional
table review is claimed. No new ADR is needed for this schema/ownership cleanup.

No typecheck, lint, tests, builds, acceptance, formatting, documentation/citation/
frontmatter/whitespace checks, obsolete-reference checks, independent implementation
review or storage-preservation comparisons ran. Initial consumer discovery and
implementation reasoning are not passing verification. No reset, migration,
deployment, data deletion, archive or commit was performed.

## Remaining work

None under this archived plan.
