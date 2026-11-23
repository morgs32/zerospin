# Structured actor fanout subscriber identity

**Date:** 2026-10-15

**Status:** Complete on 2026-10-15. Implementation, current documentation and required verification passed.

**Related:** [Plan 151](../../plans/151-plan-storage-table-review.md), [actor subscriber finding](../../reviews/storage-tables/aggregate-version-chain-actor-version-chain-fanout-subscribers.md), [Plan 203](203-plan-aggregate-version-chain-agent-fanout.md), [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md).

## Approved model and scope

1. Replace AggregateVersionChain.actorVersionChainFanoutSubscribers with exactly four non-null columns: `actorName`, `actorVersion`, `actorPath`, `acknowledgedAggregateIndex`. Enforce composite uniqueness over the three identity fields. Retain the table name and durable membership even when caught up; there is no deletion/expiry change.
2. Reconstruct the full AggregateActorVersionRepo key from the bound AggregateVersionChain owner plus the stored identity triple. Preserve complete owner-qualified RPC identity and canonical actor paths. Remove stored `aggregateActorVersionRepoName` and `currentIndex` outright; add no packed replacement ID, hash, synthetic column or compatibility path.
3. Replace the shared queue's single-string identity assumption with one uniform structured identity binding. Bind named identity columns, map full recipient keys to those SQL identities and back, and use the same representation for enrollment, uniqueness, lookup, acknowledgement, eligibility and in-flight/failed exclusion. Other queues bind one-field identities through this same API and retain their existing physical schemas and behavior.
4. Preserve bounded SQL selection, deterministic identity ordering and exclusion before LIMIT. Use structured identity values in memory; do not require a persisted or transient packed subscriber ID. Keep large exclusion/membership sets within SQLite parameter limits, such as by passing structured JSON records to SQL rather than expanding one parameter per excluded field.
5. Preserve transactional monotonic `max` updates, absent-versus-zero membership, safe enrollment range/source-tip checks, fixed-tip drains, independent recipient settlement, catch-up before enrollment, source-bound receiving capabilities, both pre-commit producer leases and durable alarm recovery. Source acknowledgement remains distinct from receiver materialization and selected Chain publication.
6. Keep queue RPC `currentIndex` and receiver progress APIs unless the uniform identity implementation requires a direct consumer change; the approved rename concerns this table's SQL acknowledgement field. Do not normalize the unreviewed agent subscriber table or add authored-availability, retirement, unsubscribe, TTL or failure-gate policy. Service pending-delivery hooks and schemas remain intact.

## Implementation sequence

1. Preserve concurrent WIP and inspect current consumers. Use a composite unique index supported by existing table builders rather than inventing a primary-key primitive or extending schemas with an ID column.
2. Update shared queue/storage/delivery identity types and all direct production/fixture bindings to one structured API. Eliminate superseded `subscriberIdColumn`/ID conversion assumptions rather than preserving a legacy mode. Preserve owner checks and unavailable-release membership filtering.
3. Change the actor subscriber schema and binding, mapping the four bound source fields at the recipient lookup boundary. Keep the agent table and other owner schemas unchanged.
4. Update existing verification scenarios and fixture bindings only. Prove physical columns/uniqueness, independent actor-path acknowledgement, monotonic reenrollment, retry exclusion and caught-up retention; keep shared replay/Service/agent checks. Create no test, fixture, runner or configuration file.
5. Update current module/glossary/pattern/architecture guidance, the finding and Plan 151. Record the schema change in the governing ADR where appropriate. Refresh existing declaration-only metadata and source citations without any Explorer verification.
6. Format/check affected files. Run one explicit system-worker dependency graph for `lib`, `ts`, `lint`, `test-workerd-ts`, `test-workerd`, then existing `node scripts/verify-plan140.mjs` against current artifacts. Resolve in-scope failures and independently audit structured-key equality/exclusion and source acknowledgement.
7. Record verification, complete remaining-work status and archive this same plan only when required checks pass; preserve filename and repair inbound/relative links.

## Planned files

`+` creates a document; `~` edits an existing file. Direct consumers discovered through the shared API change are included.

```text
zerospin/
  wiki/plans/
    + 204-plan-aggregate-actor-fanout-subscriber-identity.md
    ~ 151-plan-storage-table-review.md
  packages/system-worker/src/
    makeFanoutQueue/
      ~ makeFanoutQueue.ts
      ~ makeFanoutQueueStorage.ts
      ~ runFanoutDeliveries.ts
      ~ README.md
    AggregateVersionChain/
      ~ aggregateVersionChainDbConfig.ts
      ~ AggregateVersionChain.ts
      ~ README.md
    ~ AggregateChain/AggregateChain.ts
    ~ ServiceChain/ServiceChain.ts
    ~ ServiceVersionChain/ServiceVersionChain.ts
  packages/system-worker/test/
    ~ fanout-queue/{fixture.ts,fanout-queue.workerd.spec.ts}
    ~ migratable-do-repo/{owners.worker.ts,system-repo-activation.workerd.spec.ts}
  scripts/
    ~ verify-plan140.mjs if shared identity expectations require it
  wiki/
    ~ glossary.md, adrs/013-aggregate-delivery-history-and-projection-ownership.md
    ~ relevant system-worker patterns and current architecture source references
    ~ reviews/storage-tables/aggregate-version-chain-actor-version-chain-fanout-subscribers.md
  explorer/src/data/
    ~ schema-snapshot.json, table-purposes.ts
```

## Verification and cutover

1. `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p system-worker --nxBail`, preserving required dependencies/caches and avoiding overlapping output writers. Existing `node scripts/verify-plan140.mjs` runs afterward. Keep verification scoped to the affected shared queue and owners; no Explorer checks are allowed or required.
2. Use existing production owner and shared queue tests for full composite key lookup/update/conflict/exclusion, unchanged single-field bindings, monotonic progress and source-owner reconstruction. Preserve existing retry, cold activation, failure isolation, fixed-boundary and bootstrap checks. Additional publication hash validation remains deferred.
3. Check scoped formatting, whitespace, current doc links/source ranges, source metadata and stale identity API/schema references. Declaration capture reads source without executing owner modules.
4. Changed fixed schemas require empty affected AggregateVersionChain storage. Add no migration, alias, fallback decoder, dual API or compatibility-only test. No storage reset, provider operation, commit, publication or deployment is authorized.

## Verified result

1. The actor subscriber table now has exactly four non-null columns: `actorName`, `actorVersion`, `actorPath` and `acknowledgedAggregateIndex`. A unique index covers all three identity fields. AggregateVersionChain reconstructs the full recipient key from its bound owner and the stored triple. No full Repo name or replacement ID remains in this table.
2. All five production queue bindings use `subscriberIdentityColumns`, `subscriberIdentityFromKey` and `subscriberKeyFromIdentity`. Enrollment, conflict handling, lookup, acknowledgement, ordering, availability membership and failed/in-flight exclusion use the complete identity. Structured JSON sets bound SQL parameter counts and filter before `LIMIT`; delivery state carries identity records. Other physical subscriber schemas, Service hooks, RPC cursors, transaction boundaries, producer leases and alarm recovery remain unchanged.
3. Existing owner verification proves physical columns, composite uniqueness, duplicate rejection, independent acknowledgement for two actor paths, monotonic reenrollment and recovery after one path's acknowledgement fails. The existing shared-queue fixed-drain scenario runs with both single-field and composite identities, proving independent settlement, exclusion, a fixed source tip and later alarm retry. No test, fixture, runner or configuration file was created.
4. `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p system-worker --nxBail` passed all **9 tasks**, including **27 Workerd tests across 6 files**. After type-only import cleanup, the corresponding `lib`, `ts`, `lint` and `test-workerd-ts` graph passed all **8 tasks**. Final lint reported zero errors and 13 existing brace-style warnings. Nx Cloud's access 401 was ancillary to successful local execution. Logs: `/tmp/plan204-quality.log`, `/tmp/plan204-final-types.log`.
5. Existing `node scripts/verify-plan140.mjs` passed all **13 contract acceptance groups** against current artifacts. Log: `/tmp/plan204-plan140.log`. Independent source review found no actionable bug in composite matching, bounded exclusion, receipt-gated acknowledgement, full-key reconstruction, monotonicity or unchanged queue lifecycle.
6. ADR 013, the recorded finding, Plan 151, module READMEs, glossary, patterns and current architecture describe the implemented model. Five architecture documents have refreshed source metadata and current citations. Declaration-only capture recorded 14 concrete Repos and 58 table declarations without executing source modules; fixed owner/table counts remain unchanged. No Explorer verification was run.
7. Scoped formatting, whitespace, current document links/source ranges and stale shared identity API checks passed. Changed fixed schemas require empty affected AggregateVersionChain storage. No compatibility path, migration, reset, provider call, commit, publication or deployment occurred. Concurrent WIP was preserved. Additional enrollment/availability policy, the agent subscriber table review and publication hash validation remain outside this implementation.

## Remaining work

None.
