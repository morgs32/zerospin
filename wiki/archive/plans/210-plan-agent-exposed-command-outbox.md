# Agent exposed-command outbox

**Date:** 2026-10-16

**Status:** Complete; implementation and required verification passed. Archived 2026-10-16. Implements the [Agent pending-publication finding](../../reviews/storage-tables/aggregate-agent-version-repo-projected-command-outbox.md).

## Problem and agreed behavior

Before this change, AggregateAgentVersionRepo stored ten flat pending-publication fields under `projectedCommandOutbox`, reusing retained Agent history's shape. Five nullable columns described one optional private resolution; Agent Origin and session name are fixed by its bound authored agent version. The shared queue already used exposed-command naming.

1. Replace only the Agent Repo pending table with physical `exposedCommandOutbox` containing five required columns (`aggregateIndex` primary key, `dispositionChainHash`, canonical admitted `id`, `commandName`, frozen `delta`) and nullable JSON `commandResolution: { nodeId, pushIndex, failure }`. Require nonempty Node ID, positive safe push index and the existing complete nullable public refusal. Null resolution means no owned resolution; present/null failure means owned Success; present failure means owned Failure.
2. Remove stored full Agent Origin and session name. Resolve `system.agents[key.agentName][key.agentVersion]`, validate its exact Aggregate release, and restore the declared session plus current Agent publication `claims: null` at the shared publication boundary. Derive Agent Origin from the immutable owner as currently done by Agent Chain. Never choose a latest/other version or infer variable Node/push/refusal from external history.
3. Preserve atomic resource/head/complete pending publication commit, all-command ordering including Failure/no-op, frozen deltas, exact source keys and retry equality, durable alarm recovery, receipt-gated exact deletion and bounded snapshot/bootstrap behavior. Invalid compact resolutions or unavailable/mismatching Agent declarations must fail preparation before append/acknowledgement.
4. Keep AggregateAgentVersionChain's flat `projectedCommands`, indexes, lock schema and decoder unchanged. Keep all Service physical storage unchanged. Use separate pending and history codecs for their distinct responsibilities; add no fallback, compatibility alias, decoder, migration, legacy columns or old pending table. The Agent Repo fixed-schema cutover requires empty affected storage; perform no reset or deployment.
5. Preserve unrelated WIP. Update existing verification only; create no test files, fixtures, runners or configuration. Additional AggregateVersionChain publication hash validation stays deferred.

## Implementation and documentation

1. Define the compact owner-local Agent resolution codec and independent six-column Agent outbox. Update the projection producer and queue physical binding/decoder; remove the pending dependency on flat Agent history's shape.
2. Reconstruct only owner-derived protocol context during Agent outbox preparation. Preserve the existing full shared publication and unchanged Agent Chain append/read path. Keep transaction boundaries and use focused domain procedures without forwarding wrappers or unsafe casts.
3. Extend existing Agent acceptance assertions and Workerd projection/cold-restart checks. Prove six-column schema/old-table absence, actual compact Success/Failure/unowned rows, exact Agent session reconstruction, invalid-resolution/declaration rejection, frozen delta/order, retry/acknowledgement and unchanged Agent Chain/Service storage. Keep checks concise and reuse existing scenarios.
4. Reconcile the Agent/shared projection READMEs, local ownership pattern, glossary, governing ADR 013 Agent-storage clause, finding and Plan 151. Amend the existing governing ADR for the accepted pending-only change; create no new ADR. Plan 151's next table remains AggregateAgentVersionChain.projectedCommands.
5. Complete scoped verification and independent source review; resolve in-scope failures. Record the result and archive this same plan with repaired inbound/relative links only after all required checks pass.

`+` creates; `~` modifies:

```text
zerospin/
  wiki/plans/
    ~ 151-plan-storage-table-review.md
  wiki/archive/plans/
    + 210-plan-agent-exposed-command-outbox.md
  packages/system-worker/src/aggregateProjection/
    + agentCommandResolution.ts
    + decodeAgentOutboxPublication.ts
    ~ aggregateProjectionDbConfig.ts
    ~ commitProjectionTx/commitProjectionTx.ts
    ~ makeExposedCommandOutbox.ts
    ~ README.md
  packages/system-worker/src/aggregateSessionChain/
    ~ README.md (qualify unchanged Agent Chain storage)
  packages/system-worker/src/AggregateAgentVersionRepo/
    ~ README.md
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts
  scripts/
    ~ verify-plan140.mjs
  explorer/src/data/
    ~ table-purposes.ts (one metadata entry; no Explorer verification)
  wiki/
    ~ glossary.md
    adrs/
      ~ 013-aggregate-delivery-history-and-projection-ownership.md
    patterns/
      ~ index.md
      system-worker/
        ~ versioned-aggregate-actor-owned-projection.ts
    architecture/
      ~ AuthoredSystem.md (Agent pending-storage clause/citations)
      server/
        ~ admitAggregateCommands.md (Agent pending-storage clause/citations)
    reviews/storage-tables/
      ~ aggregate-agent-version-repo-projected-command-outbox.md
      ~ aggregate-agent-version-repo-materialization-head.md (current pending name/citations)
```

## Verification

1. Reuse the inspected `system-worker` graph: `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker --nxBail`, including required dependency library tasks and normal caching. Do not overlap library rebuilds with acceptance execution. Never verify Explorer.
2. Run the existing `node scripts/verify-plan140.mjs` against the resulting artifacts. Update existing Agent scenarios and assertions rather than creating another runner or exhaustive cases.
3. Compare preserved Agent Chain and Service declarations with the pre-change snapshot; inspect consumer completeness and independent lifecycle review. Format/check only changed files, source citation links/ranges and scoped whitespace.

## Implementation and verification outcome

AggregateAgentVersionRepo now stores the five required exposed-command fields plus nullable `commandResolution: { nodeId, pushIndex, failure }` in `exposedCommandOutbox`. The producer writes the compact row in the existing resource/head transaction. Queue preparation strictly decodes that row, validates the exact bound Agent declaration and Aggregate release, and restores its declared session plus shared protocol `claims: null` before publication. Missing/mismatching declarations are checked even for an unowned command. AggregateAgentVersionChain retains its existing flat history and reconstructs Agent Origin from its immutable owner.

- `pnpm nx run-many -t ts lint test-workerd-ts test-workerd -p system-worker --nxBail` passed: all nine graph tasks succeeded, with four dependency tasks cached; 27 Workerd tests passed across six files. Lint reported zero errors and thirteen existing `curly` warnings outside this change. Ancillary Nx Cloud access returned 401 after the local tasks succeeded; it did not block verification.
- `node scripts/verify-plan140.mjs` passed all thirteen acceptance groups against the completed library artifacts. Existing Agent scenarios assert the six-column row, owned Success/Failure versus absent resolution, exact authored-version session restoration, invalid resolution/declaration rejection before delivery or deletion, frozen deltas across retry, receipt-gated deletion, and retained history/private-prefix recovery. Existing Workerd activation/cold-restart checks assert the physical table/constraints and old-table absence.
- Independent production review found no actionable correctness, privacy or recovery issue. Byte comparisons with the pre-change snapshot confirmed unchanged Agent Chain table/schema/decoder/append/class/config and the inspected Service storage declarations. Source search found no old Agent pending binding or flat-history codec dependency in the Agent Repo/projection path; old pending names in the existing Workerd checks assert absence.
- Scoped formatting passed for all twenty code/check/documentation files; scoped whitespace, documentation links/source ranges and refreshed architecture source metadata passed.
- Affected README, ADR 013, glossary, ownership pattern, architecture clauses, storage findings and Plan 151 reflect the pending-only change. The authored table-purpose entry uses the new physical name. Plan 151's next review remains AggregateAgentVersionChain.projectedCommands.

This fixed-schema change requires empty affected AggregateAgentVersionRepo storage. No reset, deployment, compatibility decoder or migration was performed. Agent Chain and Service physical storage remain unchanged.

## Remaining work

None.
