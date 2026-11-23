# Four-column Aggregate replica metadata and transactional row allocation

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 by maintainer-approved consolidation into [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md). Its surviving correctness and verification requirements remain unfinished there. This is consolidation, not verified completion of this plan or its former storage representation.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Aggregate session replica.sessionMetadata](../../reviews/storage-tables/aggregate-session-replica-session-metadata.md). **Related:** active [Plan 223](223-plan-aggregate-replica-staging-outcome-and-inverses.md), whose written staging/inverse/delta cleanup remains independently unverified.

## Archival disposition — 2026-10-26

Maintainer-approved consolidation on 2026-10-26 retires this independent checklist. [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#consolidated-verification-obligations) owns the surviving requirements under current Node/session-replica representations; [Plan 151](../../plans/151-plan-storage-table-review.md) tracks that work. Earlier implementation descriptions, storage formats and verification seams below are historical and do not authorize restoring removed representations or tooling.

## Problem and agreed behavior

Aggregate session metadata currently copies the observing session's bound Origin and a nextSessionIndex counter that is derivable from its retained commands. Keep only independent local identity and coverage facts. Remove the redundant storage and its write/compare plumbing without losing invocation authority, transactional ordering or resource/checkpoint continuity.

1. Retain exactly four required fields on Aggregate session replica.sessionMetadata: sessionId primary key, afterNodeIndex, aggregateIndex and dispositionChainHash. Keep its current table name and practical owning-scope singleton. Add no replacement identity JSON, fingerprint, allocator row, synthetic singleton ID, status or compatibility field.
2. Derive the initialized session Origin from its exact bound session definition/admitted identity. Remove metadata Origin reads/writes and duplicate SQL self-comparisons. Preserve complete per-command commands.origin and its full invocation claims, including standalone cross-tab replay. Keep real admission, bound release/Actor/Agent/full-claims validation, Native keyed ownership and session-ID/presence checks. Validate snapshot identity against the bound context before replacing local resources; do not move a removed persisted-origin comparison after commitment.
3. Remove nextSessionIndex. At each actual new command-phase insertion, allocate `(max(commands.sessionIndex) ?? 0) + 1` using the same synchronous transaction as the insert and resource/inverse/checkpoint changes. Share the meaningful indexed-max lookup and existing positive/safe-integer/exhaustion checks between staging and import. Exact retries and coordinate enrichment reuse their retained position and allocate nothing. Rollback consumes no position. Do not renumber retained rows or allocate outside SQL.
4. Preserve current snapshot/reset retention: ordinary snapshots retain command history/positions and replace resource/current-inverse state; explicit authorized reset clears commands and metadata together so the next position is one. afterNodeIndex stays cursor-neutral for point receipts and advances only with committed contiguous stream coverage. aggregateIndex/hash remain the authoritative resource base beneath local optimism and commit with selected resource changes.
5. Update actual shared Agent/mock/Native consumers. Agent rejection may delete a staged row; allocation is based on surviving local rows, while its canonical command IDs, real pushIndex allocation and delivery/private-prefix checks remain unchanged. Reuse of a deleted trailing local sessionIndex must not become a new producer identity or alter transport progress. Preserve independently owned Agent delivery metadata and all Service physical storage/protocol.
6. Native replica fixed storage changes from version 4 to version 5, rejecting unsupported nonempty files without translation. AggregateNode's version-15 schema is unchanged by this metadata-only storage cutover. Require empty affected replica storage, with no aliases, migration, fallback decoder, automatic reset, deployed-data deletion, deployment or commit.
7. Update directly affected existing assertions/seed consumers in place. Create no test, fixture, runner or configuration files. Keep every type/lint/test/build/acceptance, formatting/documentation/citation/frontmatter/whitespace check, obsolete-reference check, independent implementation review and storage-preservation comparison deferred.

## Implementation sequence

1. Change the Aggregate metadata schema and remove Origin/allocator writes from staging, ordered import and both snapshot paths. Add one transaction-local allocation procedure used only for new command phase rows. Preserve Plan 223 changes and unrelated WIP.
2. Simplify initialized capability construction to bound Origin. Update the browser/Native snapshot receiver and Agent direct-snapshot binding checks so identity validation precedes mutation. Keep Native exact keyed ownership and metadata-presence/session-ID restoration without the redundant Origin column; increment only its replica guard.
3. Update mock and shared Agent consumers as needed and adapt existing Aggregate/Service mixed seed/assertion branches without changing Service's representation. Preserve actual Agent producer indices and its rejection/rebase ordering.
4. Reconcile affected module/Native/browser documentation, existing ADR text, glossary, the metadata finding and Plan 151. Old ADRs provide context and documentation, not a reason to retain the redundant representation. Record no new table review and keep Service session replica.commands next.
5. Record the written implementation and every deferred check below. Keep this plan active and archive only after required verification is later authorized and passes.

## Planned file hierarchy

`+` creates; `~` modifies. Direct consumer discovery may adjust affected existing files within this scope. Preserve other active plans' edits.

```text
zerospin/
  packages/core/src/aggregateSession/
    + allocateAggregateSessionIndexTx.ts
    ~ sessionRepoDbConfig.ts
    ~ makeInitializedAggregateSession.ts
    ~ initializeAggregateNodeProjection.ts
    ~ applyOrderedAggregateOccurrencesTx.ts
    ~ stageCommand/stageSessionCommandTx/stageSessionCommandTx.ts
    ~ stageCommand/stageAggregateSessionCommand.ts
    ~ applyAggregateSessionSnapshot/applyAggregateSessionSnapshot.ts
    ~ applyAggregateSessionSnapshot/applyAggregateSessionSnapshotTx/applyAggregateSessionSnapshotTx.ts
    ~ README.md
  packages/browser/src/
    ~ sessionReplica/makeAggregateReplicaReceiver.ts
    ~ makeMockBrowserSession/createMockAggregateSession.ts
    ~ agentSession/ affected bound-snapshot consumers
    ~ makeBrowserSession/README.md
  packages/native/
    ~ src/openPersistentAggregateReplica.ts
    ~ README.md
  scripts/
    ~ affected existing verification scripts (unrun)
  wiki/
    ~ glossary.md
    ~ affected current ADR/architecture/pattern prose
    plans/
      + 224-plan-aggregate-replica-metadata-and-session-index.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ aggregate-session-replica-session-metadata.md
```

## Verification seams — deferred

1. When deferral ends, inspect current Nx configuration and run the scoped core/browser/Native and actual affected consumer type/lint/test graph with required dependencies, plus the existing Aggregate session/Node/standalone/Agent acceptance seams. Never verify Explorer. Keep Plan 223 and other active plans' evidence separate.
2. Establish new local/imported phase allocation from one transaction's current maximum, no allocation on exact retries/enrichment, safe-index exhaustion rollback and no partial resource/inverse/checkpoint changes. Cover consecutive batch inserts, retained-history snapshot replacement and explicit full reset restarting at one through existing seams.
3. Establish bound Actor/Agent/full-claims and snapshot owner/release/session validation before resource mutation, preserved per-command invocation Origin, Native metadata/session-ID restoration and version-5 rejection without migration/reset. Compare unchanged AggregateNode schema, Service storage/protocol and actual Agent producer/rejection guarantees.
4. Complete deferred formatting/documentation/link/citation/frontmatter/whitespace and obsolete-reference checks, source hash/range refresh, independent implementation review and storage-preservation comparisons. Resolve in-scope failures, record actual evidence and archive only after these checks pass.

## Implementation outcome — unverified

sessionMetadata now has exactly four required fields: sessionId primary key,
afterNodeIndex, aggregateIndex and dispositionChainHash. Origin and nextSessionIndex
are removed from schema, initialization, staging, import and snapshot persistence.
No replacement table, identity JSON/fingerprint or high-water row is added.

allocateAggregateSessionIndexTx reads the greatest retained command position using
its index, adds one and preserves the current positive/safe-integer/exhaustion
policy. Staging and first import allocate using their already-open synchronous
transaction; duplicate and coordinate-enrichment paths retain their original index.
Each later insert in a batch sees earlier rows in the same transaction. No position
is spent on rollback. Ordinary snapshots keep command history, and the existing
full-reset branch clears history so the next local allocation is one.

Initialized capability construction requires existing singleton metadata with the
exact local sessionId. It builds Actor Origin from bound session definition/full encoded
admission claims and validates/derives exact Agent Origin. The old persisted-Origin
comparison is removed. Snapshot/mock initialization owns checkpoint creation;
staging's metadata read/upsert and obsolete state prop/core caller argument are
removed rather than preserving a cached-checkpoint reconstruction fallback.
Complete per-command invocation Origin and Plan 223 outcome/current-inverse/final
delta responsibilities remain in the written source.

Both snapshot persistence paths write only the four metadata fields. The core
Node snapshot path checks session definition identity before mutation; direct snapshots
check exact Agent name/version and retained local session ID before mutation.
Browser connect compares the complete snapshot identity with its resolved Node
identity before forwarding; the receiver checks declared identity, claims/Aggregate
selection and a frozen full lifetime identity before projection changes. Reset can
replace Node epoch without replacing bound identity.

Native validates its initialized Node snapshot/owner, session definition/lock, complete
claims and exact storage key before opening/provisioning the replica. Metadata
still must exist and its sessionId decode before nonempty provisioning. Native
replica guard is 5, AggregateNode guard/schema remains 15, and unsupported storage
has no translation/reset path added. Mock metadata seed writes four columns.
Shared Agent consumers use the same core allocation; canonical command IDs,
pushIndex producer metadata, private-prefix and rejection handling remain
independently owned. Service physical storage/protocol and allocator are unchanged
by these edits; preservation comparisons remain unrun.

Before removal, `verify-session-identity.mjs` mixed reset fixtures allocated
Aggregate seed rows transactionally from commands and retained Service's stored
allocator branch. They
asserted Aggregate metadata keys/empty-history reset allocation separately from
Service nextSessionIndex. The `verify-plan140.mjs` Aggregate capability fixture
seeded required four-column metadata before capability construction. No new
test/fixture/runner/configuration files were created, and no assertion was run.
The standalone verification scripts have since been removed.

Aggregate module/browser/Native READMEs, existing ADRs 003/004, glossary, affected
workflow/pattern prose, the historical metadata finding and Plan 151 record the
written result. No new ADR is needed for this bounded representation cleanup.
Plan 151 keeps Service session replica.commands next, and no additional table
review is claimed. Prior Plans 223 and other unfinished plans retain their own
unverified status; older source findings do not become passing results.

No typecheck, lint, tests, builds, acceptance, formatting, documentation/citation/
frontmatter/whitespace checks, obsolete-reference checks, independent implementation
review or storage-preservation comparisons ran. Initial consumer discovery and
implementation reasoning are not passing verification. No reset, migration,
deployment, data deletion, archival or commit was performed.

## Remaining work

None under this archived plan.
