# Three-column Service replica checkpoint and transactional row allocation

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 by maintainer-approved consolidation into [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md). Its surviving correctness and verification requirements remain unfinished there. This is consolidation, not verified completion of this plan or its former storage representation.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Service session replica.serviceSessionMetadata](../../reviews/storage-tables/service-session-replica-session-metadata.md). **Related:** active [Plan 225](225-plan-service-replica-command-state.md), whose command cleanup remains independently unverified.

## Archival disposition — 2026-10-26

Maintainer-approved consolidation on 2026-10-26 retires this independent checklist. [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#consolidated-verification-obligations) owns the surviving requirements under current Node/session-replica representations; [Plan 151](../../plans/151-plan-storage-table-review.md) tracks that work. Earlier implementation descriptions, storage formats and verification seams below are historical and do not authorize restoring removed representations or tooling.

## Problem and agreed behavior

Service session metadata mixes independent resource/Node coverage with repeated lifetime/release identity and a counter derivable from retained commands. Service owns a fresh in-memory replica per Scope; its local sessionId is already captured with the DB and initialized capability. Keep the independent checkpoint and remove the duplicate storage without weakening actual lifetime or singleton boundaries.

1. Retain exactly three required columns on serviceSessionMetadata: afterNodeIndex, serviceIndex and dispositionChainHash. Keep its physical name. Remove sessionId, actorName, actorVersion, serviceVersion and nextSessionIndex, with no replacement singletonId, identity JSON/fingerprint, counter, status or timestamp. The table has no declared primary key.
2. Preserve local sessionId in the initialized capability, Devtools and captured lifetime/DB checks. Preserve immutable full authenticated Service identity and release/Actor/session/claims checks before projection mutation, plus current-capability fencing before stage commit and stale callback rejection. Remove only the redundant SQL local-ID comparison and copied identity plumbing. Actual authorization continues to use the bound session definition and private authenticated identity, never SQL progress or mutable published claims.
3. Make singleton responsibility explicit. Initialization may begin with no metadata row, must reject ambiguous multiple rows before mutation, and must create/replace exactly one three-field checkpoint with snapshot resources in the same synchronous transaction. Ordinary stage/import/final paths require exactly one row and fail on missing or ambiguous state. Remove key-dependent where/upsert plumbing; never silently select an arbitrary row or update several rows. Mock initialization seeds the same shape atomically with its resources.
4. Allocate each genuinely new command phase's sessionIndex as `(max(commands.sessionIndex) ?? 0) + 1` within the same synchronous transaction as insertion and resource/current-inverse/checkpoint changes. Use an indexed greatest-position lookup and preserve positive/safe-integer/exhaustion checks under the existing ceiling. Exact retries and coordinate enrichment retain their original local position; ahead point recovery defers without allocation. Later batch inserts see earlier inserts. Rollback consumes no position. Add no cached allocator, reservation or separate durable high-water fact.
5. Ordinary snapshots retain command rows and positions while replacing resources/current inverses and the captured checkpoint. Explicit announced reset clears commands/checkpoint together, so empty history naturally restarts allocation at one. Retain point-receipt cursor neutrality, ordered contiguous Node coverage, independent Service prefix/hash checks, covered-final non-reapplication and ahead recovery deferral. Never infer checkpoint or coverage from command maxima.
6. Preserve Service command history's thirteen columns, phase indexes, source contractVersion, stagingOutcome, current inverseOperations and exposedDelta. Keep ServiceNode schema/guard 15, AggregateNode schema/guard 15, Native replica schema/guard 5, Aggregate replica storage and Agent producer state unchanged. This Service replica fixed-schema cutover requires empty affected storage without migrations, aliases, fallback decoders, automatic reset, deployment or commit.
7. Update consumers, existing assertions and affected module/ADR/glossary/architecture/pattern documentation. Create no test, fixture, runner or configuration files. Keep all verification deferred: types, lint, tests, builds, acceptance, formatting, documentation/link/citation/frontmatter/whitespace checks, obsolete-reference checks, independent implementation review and storage-preservation comparisons. Never verify Explorer.

## Implementation sequence

1. Replace the Service metadata declaration. Add focused transaction-local singleton reading and retained-command allocation. Update staging, ordered retention/import and snapshot replacement together, preserving transaction sequencing and prior Plan 225 behavior.
2. Remove obsolete SQL-only local-ID props and metadata identity/allocator plumbing from actual core/browser callers. Keep the browser's local identity/capability/DB fences and private bound claims. Update mock seed/capability and only the progress fields needed by the initialized capability.
3. Adapt existing script/assertion consumers in place without running them. Document three-field singleton ownership, identity boundaries, allocation and reset behavior. Update the finding and Plan 151 without reviewing another table or advancing beyond Agent session replica.commands.
4. Record the implementation outcome and all deferred checks below. Keep this plan active; archive only after required verification is later authorized and passes.

## Planned file hierarchy

`+` creates; `~` modifies. Necessary direct consumer discovery may adjust affected existing files within this scope. Preserve unrelated work.

```text
zerospin/
  packages/core/src/serviceSession/
    ~ serviceSessionRepoTables.ts
    + readServiceSessionMetadataTx.ts
    + allocateServiceSessionIndexTx.ts
    ~ stageServiceSessionCommandTx.ts
    ~ applyOrderedServiceOccurrencesTx.ts
    ~ importServiceNodeCommands.ts
    ~ initializeServiceNodeProjection.ts
    ~ affected direct consumers and README.md
  packages/browser/src/
    ~ bootstrapServiceSession.ts
    ~ sessionReplica/ affected Service callers and progress publication
    ~ makeMockBrowserSession/createMockServiceSession.ts
    ~ makeBrowserSession/README.md
  scripts/
    ~ affected existing assertion/seed consumers (unrun)
  wiki/
    ~ glossary.md
    ~ affected existing ADR/architecture/pattern prose
    plans/
      + 226-plan-service-replica-checkpoint-and-session-index.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ service-session-replica-session-metadata.md
```

## Verification seams — deferred

1. When deferral ends, inspect current scoped Nx configuration and run the affected core/browser and actual consumer type/lint/test graph with required dependencies, plus existing Service session/Node/identity/snapshot/replay acceptance seams. Never verify Explorer. Keep other active plans' evidence separate.
2. Establish missing/ambiguous ordinary checkpoint rejection, initialization from empty and one-row replacement, ambiguity refusal before mutation, atomic resources/inverses/checkpoint replacement and rollback. Establish unchanged full bound identity, local ID/DB/current-capability and late-callback fences; mock seed uses the same three fields.
3. Establish insertion-time max allocation, empty-history one, consecutive stage/batch insert ordering, no allocation on exact duplicate/enrichment/ahead deferral, safe exhaustion rollback, retained-history snapshot allocation and explicit reset restarting at one. Preserve Service/Node continuity, equal-position hash refusal, covered recovery and point cursor neutrality through existing seams.
4. Complete deferred formatting/documentation/link/citation/frontmatter/whitespace and obsolete-reference checks, source-range/hash refresh, independent implementation review and storage-preservation comparisons. Confirm Service/Node/Native guard and Aggregate/Agent preservation and the empty-storage cutover. Resolve in-scope failures and archive only after required checks pass.

## Implementation outcome — unverified

serviceSessionMetadata now declares only afterNodeIndex, serviceIndex and
dispositionChainHash, all required. Its primary key, SQL local/release identity
and stored allocator are removed without replacement state. Core stage/import/
ordered-retention/snapshot signatures no longer pass a SQL-only sessionId.
Unused openServiceReplica local-ID forwarding is also removed. Captured local
sessionId remains on the initialized capability and in Devtools; exact ID/DB/
current-capability and stale-callback fences retain their responsibilities.
Complete private authenticated identity/claims validation remains before
projection mutation and across reset/capability withdrawal.

readServiceSessionMetadataTx reads at most two rows. Ordinary stage/import/
batch/retention paths require exactly one checkpoint row; missing or ambiguous
state fails. Initialization permits absence but rejects ambiguity before PRAGMA
or resource mutation, then deletes/reinserts exactly one checkpoint within its
existing synchronous snapshot transaction. Resource replacement, current inverse
clearing, retained receipt input and pending replay remain atomic with that row.
Mock initialization seeds the same three fields with resources. The receiver
publishes only serviceIndex/hash from checkpoint progress, retaining bound
identity on its prepared capability. The touched mock capability/validator also
uses captured encodedClaims required by Plan 225's current protocol.

allocateServiceSessionIndexTx reads the greatest retained command position
through its index and adds one, keeping the existing positive/safe/exhaustion
ceiling. Stage and genuinely new imported phase rows allocate before evaluation/
rewind in the insertion transaction; exact duplicates, coordinate enrichment and
ahead point-recovery deferral allocate nothing. Enrichment keeps the existing
local position, and each batch insertion observes prior inserts. Rollback spends
no position. Ordinary snapshots retain history; explicit full reset clears it,
so empty history naturally restarts at one without a stored counter.

The thirteen-column commands model, original/final indexes, source contractVersion,
stagingOutcome/current inverses/exposedDelta, Node coverage and Service checkpoint
continuity retain their independent roles. Cursor-neutral point receipts and
covered/ahead recovery remain. No ServiceNode/AggregateNode/Native guards or
Aggregate/Agent storage are changed by these edits; preservation comparisons
remain unrun. Empty affected Service replica storage is required, with no
migration, compatibility alias/fallback decoder, automatic reset, deployment or
commit.

Before removal, `verify-session-identity.mjs` assertions/seeds used three
checkpoint fields, transactional allocation and missing/ambiguous singleton failure cases while
retaining Aggregate's separate four-field branches. The standalone verification
script has since been removed. No assertion was run and no test/fixture/runner/
configuration file was created. Module READMEs, ADRs 003/004,
glossary, affected architecture/pattern prose, the finding and Plan 151 record the
written implementation. Agent session replica.commands remains next, without
another owner/table review.

No typecheck, lint, test, build, acceptance, formatting, documentation/link/citation/
frontmatter/whitespace check, obsolete-reference check, independent implementation
review or storage-preservation comparison ran. Source ranges/hashes and inventory
totals are not refreshed or validated. No passing verification is claimed.

## Remaining work

None under this archived plan.
