# Structured agent fanout subscriber identity

**Date:** 2026-10-15

**Status:** Complete on 2026-10-15. Implementation, current documentation and required verification passed.

**Related:** [Plan 151](../../plans/151-plan-storage-table-review.md), [agent subscriber finding](../../reviews/storage-tables/aggregate-version-chain-agent-version-chain-fanout-subscribers.md), [Plan 204](204-plan-aggregate-actor-fanout-subscriber-identity.md), [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md).

## Approved model and scope

1. Replace AggregateVersionChain.agentVersionChainFanoutSubscribers with exactly three non-null columns: `agentName`, `agentVersion`, `acknowledgedAggregateIndex`. Enforce composite uniqueness over the agent name/version pair. Retain durable enrollment when caught up; there is no deletion or expiry change.
2. Reconstruct the complete AggregateAgentVersionRepo key from the stored pair and the bound AggregateVersionChain owner (`systemId`, `aggregateId`, `aggregateName`, evaluating `aggregateVersion`). Remove stored `aggregateAgentVersionRepoName` and SQL `currentIndex` outright. Add no packed substitute, hash, synthetic identity, actor path, compatibility path or migration.
3. Bind the pair through Plan 204's existing `subscriberIdentityColumns`, `subscriberIdentityFromKey` and `subscriberKeyFromIdentity` API. Remove the now-unused full-name codec from this binding. Keep complete owner-qualified RPC keys and queue RPC `currentIndex`; other subscriber schemas and the shared queue mechanism already support this model.
4. Preserve synchronous monotonic enrollment/acknowledgement transactions, safe cursor bounds, absent-versus-zero membership, fixed-tip delivery, complete-identity exclusion before LIMIT, independent recipient settlement, catch-up before enrollment, pre-commit producer leases and durable alarm recovery. Source acknowledgement remains distinct from AggregateAgentVersionRepo materialization and AggregateAgentVersionChain publication. Retained `commands` is never deleted by acknowledgement.
5. Keep authored-agent validation/availability and retirement policy outside this representation change. Do not enumerate all configured agents into eager membership or add unsubscribe, TTL, suspension or failure-state machinery. The next Plan 151 review remains AggregateActorVersionRepo.materializationHead.

## Implementation sequence

1. Preserve concurrent WIP, inspect the approved finding and direct consumers, and reuse current scoped pattern/task context. Save scoped source baselines outside the repository for reviewing this change independently of earlier work.
2. Change the agent table to the three-column model with a composite unique index. Update the agent queue binding to map full keys to the pair and reconstruct full keys from the bound owner. Remove the unused name-codec import and update every in-scope schema consumer.
3. Update existing verification scenarios only. Prove exact physical columns/non-nullability, pair uniqueness, identity-specific acknowledgement, monotonic reenrollment and recovery without resource/history reapplication. Reuse existing shared-queue composite identity, retry, cold-activation and fixed-boundary checks. Create no test, fixture, runner or configuration file.
4. Reconcile ADR 013, relevant module READMEs, glossary/pattern guidance, the finding and Plan 151 with implemented behavior. Refresh affected architecture source metadata/citations and existing declaration-only schema capture, with no Explorer verification.
5. Format/check affected files. Run one explicit system-worker dependency graph for `lib`, `ts`, `lint`, `test-workerd-ts`, `test-workerd`; then run existing `node scripts/verify-plan140.mjs` against current artifacts. Resolve in-scope failures and independently audit full identity matching, bound-key reconstruction and unchanged queue lifecycle.
6. Record results and remaining-work status, then archive this same plan only after required verification passes, preserving its filename and repairing inbound/relative links.

## Planned files

`+` creates a document; `~` edits an existing file. Direct consumers discovered through the schema change are included.

```text
zerospin/
  wiki/plans/
    + 206-plan-aggregate-agent-fanout-subscriber-identity.md
    ~ 151-plan-storage-table-review.md
  packages/system-worker/src/
    AggregateVersionChain/
      ~ aggregateVersionChainDbConfig.ts
      ~ AggregateVersionChain.ts
      ~ README.md
    ~ AggregateAgentVersionRepo/README.md
    ~ makeFanoutQueue/README.md
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts
    ~ owners.worker.ts
    ~ system.ts (extend the existing authored agent versions for identity isolation)
  scripts/
    ~ verify-plan140.mjs only if direct schema expectations require it
  wiki/
    ~ adrs/013-aggregate-delivery-history-and-projection-ownership.md
    ~ glossary.md, relevant system-worker patterns and architecture citations
    ~ reviews/storage-tables/aggregate-version-chain-agent-version-chain-fanout-subscribers.md
  explorer/src/data/
    ~ schema-snapshot.json, table-purposes.ts
```

## Verification and hard cutover

1. `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p system-worker --nxBail`, preserving dependency execution/caching and avoiding overlapping output writers. Existing `node scripts/verify-plan140.mjs` runs afterward. Scope verification to the changed schema/binding and consumers rather than unrelated WIP.
2. Use the existing Workerd owner scenario for production schema/key reconstruction and acknowledgement isolation; retain existing agent redelivery/bootstrap and actor/Service checks. The already-covered shared queue owns complete-tuple matching and bounded exclusion; add no replacement identity mechanism or exhaustive test catalogue.
3. Check formatting, whitespace, current document links/source ranges, architecture source metadata and stale physical-column references. Declaration capture extracts source without executing owner modules. No Explorer checks are allowed or required.
4. Changed fixed schemas require empty affected AggregateVersionChain storage. No compatibility alias, fallback, migration, automatic reset, provider operation, commit, publication or deployment is authorized. Additional publication `dispositionChainHash` validation remains deferred.

## Verified result

1. The agent subscriber table now has exactly three non-null columns: `agentName`, `agentVersion` and `acknowledgedAggregateIndex`. The unique index covers the agent pair. The agent queue extracts that pair and reconstructs the complete AggregateAgentVersionRepo key from its bound AggregateVersionChain owner. The obsolete stored full name, SQL cursor name and binding codec import are removed.
2. The implementation uses the existing structured identity API without changing the shared queue mechanism. Complete-pair enrollment, acknowledgement, ordering and exclusion remain transactional and monotonic. Full RPC identity, transport `currentIndex`, retained commands, actor and Service schemas, fixed-tip delivery, producer leases and durable recovery remain unchanged. Independent production review found no actionable defect.
3. Existing owner verification now proves exact physical columns/non-nullability, composite uniqueness, duplicate refusal and independent acknowledgement for two versions of the same agent. One version's failed acknowledgement does not block the other; reenrollment at zero cannot rewind progress, and retry recovers after the refusal is removed. Retained commands, the original projection's materialization head and projected history remain unchanged. Existing bootstrap, shared-queue composite identity, actor and Service checks remain. Only existing verification files were extended; no test, fixture, runner or configuration file was created. The acceptance script needed no direct schema update.
4. `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p system-worker --nxBail` passed all **9 tasks**, including **27 Workerd tests across 6 files**. Lint reported zero errors and 13 existing brace-style warnings. Required dependencies and caching were preserved (7 of 9 tasks replayed current matching outputs). Nx Cloud's access 401 was ancillary to successful local execution. Log: `/tmp/plan206-quality.log`.
5. Existing `node scripts/verify-plan140.mjs` passed all **13 contract acceptance groups** against current artifacts. Log: `/tmp/plan206-plan140.log`.
6. ADR 013, the recorded finding, Plan 151, relevant READMEs, glossary, patterns and five architecture documents describe the implemented model and separate source acknowledgement from projection materialization and selected publication. Existing declaration-only capture recorded 14 concrete Repos and 58 table declarations; fixed owner/table counts remain unchanged. Source metadata, current documentation links/ranges, scoped formatting, whitespace and stale physical-column checks passed. No Explorer verification was run.
7. Changed fixed schemas require empty affected AggregateVersionChain storage. No compatibility path, migration, reset, provider call, commit, publication or deployment occurred. Concurrent WIP was preserved. Authored-agent availability/retirement policy, the next table review and additional publication hash validation remain outside this implementation.

## Remaining work

None.
