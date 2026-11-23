# Thirteen-column Service replica commands and compact current inverses

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 by maintainer-approved consolidation into [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md). Its surviving correctness and verification requirements remain unfinished there. This is consolidation, not verified completion of this plan or its former storage representation.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Service session replica.commands](../../reviews/storage-tables/service-session-replica-commands.md). **Related:** active [Plan 223](223-plan-aggregate-replica-staging-outcome-and-inverses.md), whose Aggregate cleanup remains independently unverified.

## Archival disposition — 2026-10-26

Maintainer-approved consolidation on 2026-10-26 retires this independent checklist. [Plan 234](234-plan-node-owned-optimistic-views-and-session-replicas.md#consolidated-verification-obligations) owns the surviving requirements under current Node/session-replica representations; [Plan 151](../../plans/151-plan-storage-table-review.md) tracks that work. Earlier implementation descriptions, storage formats and verification seams below are historical and do not authorize restoring removed representations or tooling.

## Problem and agreed behavior

Service replica commands currently copy bound identity and Node submission state, retain unused staging evidence, and keep current undo state in a separate table. Normalize these responsibilities without weakening exact input comparison, identity validation, replay or independent original/final Node coordinates.

1. Retain exactly thirteen command columns: sessionIndex, id, commandName, payload, contractVersion, nodeId, nodeIndex, stagingOutcome, inverseOperations, failure, exposedDelta, serviceIndex and dispositionChainHash. Remove serviceName, actorName, actorVersion, sessionName, claims and pushIndex from these replica rows. Preserve both phase rows and all four existing unique indexes.
2. Derive removed names from the bound Service release and full encoded claims from the immutable authenticated session identity. Bind encoded and decoded claims together; retain that identity across reconnect/reset and temporarily unpublished initialized capability. Validate incoming original names and complete encoded claims before rewind, resource replacement or other mutation. Reconstruct complete ServiceNode input from that same binding, preserving full claims in ServiceNode input/history and the server admitted command protocol. Do not use current UI claims or a newly sampled credentials result as replay authority.
3. Replace staging with stagingOutcome, exactly `{ result, completedAt }`. Sample one logical successful staging timestamp and use it for initial resource writes and every replay. Remove startedAt and stagedDelta entirely. Keep the original encoded result and timestamp immutable when optimism is rebased. The public staging result still returns the decoded contract result. Canonical outcome remains `{ result, finalizedAt }` in its owning Chain; local stagingOutcome is separate evidence.
4. Add nullable inverseOperations to each original command row. Retain compact model/resource identity, original operation kind, prior values/deleted resource and required previousUpdatedAt. Null means no current applied optimism; an empty array means currently applied no-op optimism. Regenerate inverses on replay, undo commands and operations in reverse application order, and clear them on rewind/snapshot replacement. Selected final rows have null inverses. Keep mutable undo state out of stagingOutcome, Node input/history and exact handoff equality. Share the existing model-bound compact implementation with Aggregate rather than introduce a second inverse concept.
5. Remove the physical Service replica optimisticAppliedOperations table and every Service join/read/write/clear. Rename replica actorDelta to exposedDelta while preserving the selected resource changes and exposed-command transport delta. No new phase/status column, pending table, identity JSON or replacement compatibility path is introduced.
6. Keep payload source contractVersion: the accepted Node protocol permits an independent version and replay adapts that version. Keep each phase's nodeId/nodeIndex, the canonical command id, private failure, Service position/hash and the separate original/final rows. The Node's real pushIndex, producer progress and private-prefix admission remain independently owned and unchanged in responsibility. Keep Service session metadata's existing eight-column model and nextSessionIndex allocator for its own later review.
7. Change ServiceNode's fixed storage/protocol guard from 14 to 15 for compact stagingOutcome. Preserve AggregateNode version 15 and Native replica version 5. Require empty affected storage; add no migration, alias, fallback decoder, automatic reset, deployment or commit. Shared Aggregate schema/helper relocation changes ownership and names, not Aggregate storage behavior.
8. Update actual consumers, existing assertions and affected documentation/ADRs/glossary. Create no test, fixture, runner or configuration files. Old ADRs provide context and documentation; they do not require retaining superseded machinery. Keep every verification activity deferred, including tests, types, lint, builds, formatting, documentation/link/citation/frontmatter/whitespace checks, obsolete-reference checks, independent implementation review and storage-preservation comparisons. Never verify Explorer.

## Implementation sequence

1. Move the compact staging outcome and model-bound inverse implementation to neutral shared modules, update Aggregate imports, and replace the old Service staging schema outright. Update ServiceNode's input/history consumers and guard.
2. Implement the thirteen-column Service table and atomic stage, rewind, replay, ordered import and snapshot paths. Pass frozen encoded claims explicitly through reconstruction/replay boundaries. Preserve the existing metadata allocator, transaction boundaries, exact retries, coordinate enrichment, contiguous Service application and privacy.
3. Bind the complete Service identity before browser projection mutation, preserve it across reset/reconnect, and reconstruct uncertain handoff from retained input plus that identity. Update public command types, Devtools and actual mock/shared consumers.
4. Adapt affected existing assertion/seed/profile consumers in place, without running them. Update module documentation, existing ADRs, glossary, the recorded finding and Plan 151. Skip the removed optimism table in the review queue; Service session replica.serviceSessionMetadata is next and remains unreviewed.
5. Record the implementation outcome and deferred checks below. Keep this plan active until required verification is later authorized and passes.

## Planned file hierarchy

`+` creates; `~` modifies; `-` removes. Consumer discovery may adjust affected existing files within this scope. Preserve all prior and concurrent work.

```text
zerospin/
  packages/core/src/
    contracts/
      + StagingOutcomeSchema.ts
    models/
      + InverseOperationSchema.ts
      + encodeInverseOperation.ts
      + applyInverseOperationTx.ts
    aggregateSession/
      - StagingOutcomeSchema.ts
      - AggregateInverseOperationSchema.ts
      - encodeAggregateInverseOperation.ts
      - applyAggregateInverseOperationTx.ts
      ~ affected shared imports and README.md
    ServiceNode/
      ~ ServiceNode.ts
      ~ ServiceNodeCommandInputSchema.ts
      ~ serviceNodeTables.ts
      ~ readServiceNodeRecord.ts
      ~ affected input/history consumers and README.md
    serviceSession/
      - ServiceStagingResultSchema.ts
      ~ serviceSessionRepoTables.ts
      ~ evaluateServiceSessionCommandTx.ts
      ~ stageServiceSessionCommandTx.ts
      ~ stageServiceSessionCommand.ts
      ~ rewindServiceOptimismTx.ts
      ~ replayPendingServiceCommandsTx.ts
      ~ applyOrderedServiceOccurrencesTx.ts
      ~ importServiceNodeCommands.ts
      ~ initializeServiceNodeProjection.ts
      + validateServiceSessionCommandIdentity.ts
      ~ types.ts
      ~ README.md
  packages/browser/src/
    ~ bootstrapServiceSession.ts
    ~ sessionReplica/ affected Service binding/receiver consumers
    ~ affected module README.md files
  packages/devtools/src/
    ~ affected command display consumers
  scripts/
    ~ affected existing assertion/seed consumers (unrun)
  wiki/
    ~ glossary.md
    ~ affected existing ADR/architecture/pattern prose
    plans/
      + 225-plan-service-replica-command-state.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ service-session-replica-commands.md
```

## Verification seams — deferred

1. When deferral ends, use current scoped Nx configuration for affected core/browser/Devtools and actual consumer type/lint/test tasks with required dependencies. Run existing Service session/Node/identity/snapshot/replay acceptance seams. Never verify Explorer, and keep other active plans' evidence separate.
2. Establish compact undo semantics for create/update/delete/move, previous timestamps, reverse ordering and reference constraints; null versus empty current inverses; immutable original stagingOutcome; one stable completedAt; snapshot clearing and final settlement; rollback without partial command/resource/inverse/checkpoint updates.
3. Establish full encoded claims and bound names validation before mutation, retained binding across reset/reconnect/unpublished capability, complete handoff reconstruction, independent source contract versions and exact original/final Node coordinate enrichment. Preserve Node producer pushIndex and private-prefix guarantees, exact retries, covered/ahead recovery and contiguous Service checkpoint application.
4. Complete formatting/documentation/link/citation/frontmatter/whitespace checks, source range/hash refresh, obsolete-reference checks, independent implementation review and storage-preservation comparisons. Establish ServiceNode version-15 empty-storage cutover and unchanged AggregateNode/Native guards, Aggregate storage behavior and Service metadata representation. Resolve in-scope failures and archive only after all required checks pass.

## Implementation outcome — unverified

Service replica commands now declares the thirteen approved fields. Both phase
rows and all four unique indexes remain. The six repeated identity/submission
fields and physical optimisticAppliedOperations table are removed. The existing
eight-field Service metadata and allocator remain in place.

Successful staging records stagingOutcome with only the original encoded result
and one completedAt, sampled after evaluation and reused for all initial resource
writes and later replay. Rebase does not rewrite that result/time. Original
commands own compact current inverseOperations; successful no-op optimism keeps
an empty array, while absent optimism and expected replay refusals keep null.
Rewind restores commands/operations in reverse order and clears current inverses.
Snapshot replacement clears them before replay; selected finals retain none.
Local selected changes retain the name exposedDelta, with delta on transport.

The browser privately retains the complete authenticated identity across reset
and capability withdrawal. Handoff clones that binding's encoded claims;
staging/validation decode claims from it rather than trusting mutable published
values. Initialized capability exposes encodedClaims alongside decoded claims,
but those public values cannot replace the private replay/handoff authority.
Core import, ordered retention, snapshot initialization and replay receive
explicit encodedClaims. validateServiceSessionCommandIdentity centralizes exact
bound names/full encoded-claims validation before dropping repeated fields or
rewinding/replacing resources. Complete Node input reconstruction preserves
canonical id, source contractVersion, payload and original stagingOutcome. Node
input/history retains full names/claims and independently owns pushIndex.

Aggregate and Service share contracts/StagingOutcomeSchema and the neutral
models/InverseOperationSchema, encodeInverseOperation and applyInverseOperationTx.
Aggregate-specific duplicate names and obsolete full-envelope undo helpers are
removed outright. ServiceNode uses compact stagingOutcome with guard 15;
AggregateNode guard 15 and Native replica guard 5 are unchanged. Shared helper
relocation changes no Aggregate storage behavior. Empty affected storage is
required; no migration, alias, fallback decoder, automatic reset, deployment or
commit is added.

Existing Service identity/snapshot assertions and seeds are updated in place,
including compact input, explicit bound claims and thirteen-column expectations.
Devtools and actual browser/core consumers use the new representation. Existing
ADRs 003/004, module READMEs, glossary, affected architecture/pattern prose, the
original finding and Plan 151 record the written change. The queue skips the
removed optimism table to Service session replica.serviceSessionMetadata; that
table is not reviewed by this implementation. No test/fixture/runner/configuration
files were created. All existing assertions remain unrun.

No typecheck, lint, test, build, acceptance, formatting, documentation/link/citation/
frontmatter/whitespace check, obsolete-reference check, independent implementation
review or storage-preservation comparison ran. No passing verification is claimed.
Source ranges/hashes and inventory totals are not refreshed or validated.

## Remaining work

None under this archived plan.
