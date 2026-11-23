# Two-column Agent replica checkpoint and bound capability construction

**Date:** 2026-10-16

**Status:** Archived on 2026-10-26 as superseded by completed [Plan 249](249-plan-aggregate-agent-backend-node.md) and [Plan 151](../../plans/151-plan-storage-table-review.md). No browser Agent producer/journal/private-recovery work remains. This retires the former design; it does not claim its old checklist passed.

**Parent:** [Plan 151](../../plans/151-plan-storage-table-review.md). **Finding:** [Agent session replica.sessionMetadata](../../reviews/storage-tables/agent-session-replica-session-metadata.md). **Related:** superseded [Plan 227](227-plan-agent-replica-canonical-command-rows.md); current observer checkpoint scope is governed by Plan 249/151.

## Archival disposition — 2026-10-26

The maintainer approved archival on 2026-10-26. Current browser Agent Nodes retain selected materialization checkpoints, not the removed producer/journal/private-recovery design. Applicable observer physical-context reviews remain with [Plan 151](../../plans/151-plan-storage-table-review.md); independent Actor, Service and Native work is unchanged. The design and implementation descriptions below are historical.

## Current disposition — 2026-10-23

Completed [Plan 249](249-plan-aggregate-agent-backend-node.md) removes browser Agent command journals, optimistic staging, producer allocation and private completion recovery. Current AggregateAgentNode/ServiceAgentNode storage retains only the selected checkpoint and resources; current runtime evidence is recorded in completed [Plan 257](257-plan-direct-system-worker-verifications.md). [Plan 151](../../plans/151-plan-storage-table-review.md#remaining-work) owns remaining current observer context/verification and the review gate. Older “active/unverified” related-plan labels and verification instructions below refer to the superseded snapshot; they do not require verifying removed machinery.

**Historical record:** The design and written-outcome notes below retain their original snapshot; the current disposition above governs supersession and remaining work.

## Problem and agreed behavior

Agent owns fresh in-memory SQLite and direct socket delivery, but its checkpoint still inherits an Aggregate local-ID key and Node append cursor. Retain only the independently captured authoritative resource prefix/hash and remove the storage coupling, without losing singleton, lifetime or snapshot safety.

1. Declare Agent-owned sessionMetadata with exactly two required columns: aggregateIndex and dispositionChainHash. Keep the physical name. Remove SQL sessionId, afterNodeIndex and the primary key, with no replacement singletonId, identity JSON/fingerprint, counter, cursor, status or timestamp.
2. Keep the actual captured local sessionId on the immutable Agent capability and as protocol producer nodeId for bootstrap/resume/submission. Preserve exact declaration/Aggregate owner/Agent Origin/session binding, Scope/attempt/current-capability fences, private producer correlation and staged-commit checks. Remove only the redundant SQL ID comparison and key-based query/upsert plumbing.
3. Ordinary stage/import/final/publication/capability reads require exactly one checkpoint row and reject missing or ambiguous state. Initial snapshot installation may begin empty, must reject ambiguity before resource mutation, and must create/replace exactly one two-field checkpoint atomically with resources/current inverse state and covered-final recovery/replay. Never silently pick a row or update several rows.
4. Give Agent capability construction its own checkpoint access instead of querying Aggregate metadata SQL. Preserve the same immutable execution capability and exact Agent identity validation. Remove superseded Agent-only branches/forwarding from the Aggregate constructor when no longer used, updating actual callers rather than adding fake sessionId columns, compatibility projections or duplicate paths. Preserve Aggregate/Native metadata checks and storage behavior.
5. Preserve snapshot identity/resource/private-prefix validation, checkpoint regression/equal-position hash refusal before mutation, exact exposed-command equality/occupied-position/contiguous application and covered-final non-reapplication. Resource changes and the Aggregate prefix/hash remain one synchronous transaction. Initial/captured baselines can lack local command rows; do not derive the checkpoint from retained command maxima or producer prefixes.
6. Keep Agent command storage's eleven-column canonical-ID model, stagedAt/pending clearing and producer semantics unchanged. Keep Agent agentDeliveryMetadata and Aggregate/Service physical storage unchanged, including Aggregate's four-field and Service's three-field metadata. Keep AggregateNode/ServiceNode guards 15 and Native replica guard 5 unchanged. Fixed schema changes require empty affected Agent storage without aliases, migrations, fallback decoders, automatic reset, deployment or commit.
7. Update consumers, affected existing assertions if any, module documentation, existing ADR/glossary/architecture/pattern prose, the finding and Plan 151. Create no test, fixture, runner or configuration files. Keep all verification deferred: tests/types/lint/build/acceptance, formatting/documentation/link/citation/frontmatter/whitespace, obsolete-reference checks, source-range/hash refresh, independent implementation review and storage-preservation comparisons. Never verify Explorer.

## Implementation sequence

1. Replace the inherited metadata declaration with the two-field Agent singleton and update its reader, stage/import/final/snapshot procedures together. Preserve explicit cardinality and actual transaction boundaries; remove SQL-only local-ID/cursor props and predicates.
2. Add Agent-specific initialized-capability construction and update browser initialization/publication and actual constructor callers. Preserve captured lifetime authority and Aggregate/Native constructor behavior; delete obsolete Agent-only SQL coupling rather than retain forwarding aliases.
3. Adapt existing in-scope assertion/seed consumers only if discovered, without running them. Update module READMEs, ADRs/glossary and focused architecture/pattern prose. Record written implementation in the finding and Plan 151. Agent session replica.agentDeliveryMetadata remains next; complete no other table review.
4. Record outcome and all deferred checks below. Keep the plan active and archive only after required verification is later authorized and passes.

## Planned file hierarchy

`+` creates; `~` modifies. Necessary direct consumer discovery may adjust affected existing files within this scope. Preserve unrelated work.

```text
zerospin/
  packages/core/src/
    agentSession/
      ~ agentSessionRepoDbConfig.ts
      ~ readAgentSessionMetadataTx.ts
      + makeInitializedAggregateAgentSession.ts
      ~ stageAgentSessionCommandTx.ts
      ~ importAgentCommands.ts
      ~ retainAgentCommandTx.ts
      ~ applyAgentSessionSnapshot.ts
      ~ README.md
    aggregateSession/
      ~ makeInitializedAggregateSession.ts
      ~ README.md
  packages/browser/src/
    ~ agentSession/openAgentReplica.ts
    ~ affected direct Agent callers and makeBrowserSession/README.md
  scripts/
    ~ affected existing assertion/seed consumers if any (unrun)
  wiki/
    ~ glossary.md
    ~ affected existing ADR/architecture/pattern prose
    plans/
      + 228-plan-agent-replica-two-column-checkpoint.md
      ~ 151-plan-storage-table-review.md
    reviews/storage-tables/
      ~ agent-session-replica-session-metadata.md
```

## Verification seams — deferred

1. When deferral ends, inspect current scoped Nx configuration and run affected core/browser and actual constructor consumer type/lint/test tasks with required dependencies, plus existing Agent admission/identity/snapshot/replay seams. Never verify Explorer. Keep other active plans' evidence separate.
2. Establish two-field/no-key schema, missing/ambiguous ordinary-read rejection, first initialization from empty, ambiguity refusal before mutation, atomic singleton/resource/checkpoint replacement and rollback. Establish exact bound Agent identity, unchanged runtime producer ID, immutable capability/DB association and current-capability/attempt fences, with no Aggregate metadata-column access from Agent.
3. Establish unchanged contiguous final/occupied-position/exact duplicate/hash checks, regressed/equal-conflicting snapshot refusal, complete private recovery, covered-final non-reapplication, pending replay/clearing and reconnect publication of public checkpoint plus independent producer prefix.
4. Complete formatting/documentation/link/citation/frontmatter/whitespace and obsolete-reference checks, source-range/hash refresh, independent implementation review and storage-preservation comparisons, including Aggregate/Service storage, Agent commands/delivery metadata and Node/Native guards. Resolve in-scope failures and archive only after all required checks pass.

## Implementation outcome — unverified

Agent sessionMetadata now declares only required aggregateIndex and
dispositionChainHash, with no primary key, SQL sessionId, afterNodeIndex or
replacement state. It no longer reuses Aggregate's metadata declaration.
Aggregate four-field and Service three-field metadata/storage remain on their
own declarations; Agent commands and producer metadata shapes are unchanged.

readAgentSessionMetadataTx accepts the real DB/transaction read context and reads
at most two rows. Ordinary stage/import/final/capability/publication require
exactly one row, rejecting missing or ambiguous state. Initialization alone
permits absence, rejects ambiguity before resource mutation and deletes/reinserts
exactly one checkpoint inside the existing synchronous resource/current-inverse/
covered-final/replay transaction. SQL-only local-ID arguments, key predicates,
upsert and dead Node cursor copying are removed. Exact final/name/occupied-index/
contiguous/hash checks and snapshot identity/resource/private-prefix/regression
guards retain their responsibilities.

makeInitializedAggregateAgentSession validates exact Agent Origin/declaration, requires
the Agent checkpoint and creates the immutable execution capability from the
captured DB, Aggregate owner, declaration and runtime sessionId. Agent no longer
queries Aggregate metadata SQL. makeInitializedAggregateSession retains the
Actor/Native metadata/identity path and removes its superseded Agent branch.
Browser initialization calls the Agent constructor and publication uses the
exact-singleton reader through the owning execution context. Runtime sessionId
still supplies producer nodeId for bootstrap/resume/submission; Scope/current-
attempt/current-capability fences remain, and no fabricated SQL identity or
fallback construction path is added.

Core/browser consumers, module READMEs, ADR 003, glossary, focused architecture
prose, the recorded finding and Plan 151 document the written result. Necessary
consumer discovery found existing initializer script fixtures are Actor-only;
they remain unchanged. No new test/fixture/runner/configuration was created or
executed. Agent session replica.agentDeliveryMetadata remains next; no additional
owner/table review is completed.

Aggregate/Service storage, Agent commands/producer metadata and Node/Native guards
were outside the cutover; preservation comparisons remain unrun. Empty affected
Agent storage is required without migrations, compatibility aliases, fallback
decoders or automatic reset. No reset, deployment or commit occurs. No typecheck,
lint, test, build, acceptance, formatting, documentation/link/citation/frontmatter/
whitespace check, obsolete-reference check, independent implementation review or
storage-preservation comparison ran. Source ranges/hashes and inventory totals
are not refreshed or validated. No passing verification is claimed.

## Remaining work

None under this archived plan.
