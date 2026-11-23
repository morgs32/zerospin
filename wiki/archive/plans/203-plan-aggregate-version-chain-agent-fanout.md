# Deliver Aggregate agent fanout from retained commands

**Date:** 2026-10-15

**Status:** Complete on 2026-10-15. Implementation, current documentation and required verification passed.

**Related:** [Plan 151](../../plans/151-plan-storage-table-review.md), [agent payload finding](../../reviews/storage-tables/aggregate-version-chain-agent-version-chain-fanout.md), [Plan 202](202-plan-aggregate-version-chain-commands-and-actor-fanout.md), [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md).

## Problem and approved behavior

1. The physical `AggregateVersionChain.agentVersionChainFanout` table duplicates complete evaluated commands already retained permanently in the same database. Remove this table, its append insertion, agent-only backfill/pruning and its delivery-reader/hook overrides. Add no replacement pointer, marker or payload store.
2. Deliver complete `IEvaluatedCommand` values directly from `commands` through the existing queue reader fallback, as actor fanout already does. Both queues retain independent subscriber cursors, source-bound capabilities, fixed-tip paging, pre-commit producer leases and durable alarms. Acknowledgement advances subscriber progress and never deletes retained commands.
3. Preserve exact command shape, canonical `id`, full admitted input, original admission-release provenance, `outcome: { result, finalizedAt }`, sparse operation indexes and immutable duplicate equality. Neither repeated append nor delivery reruns evaluation or allocates new external IDs.
4. A successful AggregateAgentVersionRepo receipt proves its resource changes, materialization progress and complete pending selected publication committed together. It does not prove AggregateAgentVersionChain publication. Lost receipts may redeliver commands without reapplying committed positions. Late activation catches up from commands and enrolls its committed cursor; retained commands cover that interval. Agent bootstrap still recovers selected history through its exact captured snapshot prefix.
5. Keep both subscriber tables and queue names; no subscriber-table purpose review is included. Preserve shared pending-reader/enrollment/pruning hooks used by ServiceVersionChain and keep Service storage unchanged. Complete pending publication remains required in resource-owning Repos.
6. Amend existing ADR 013/016 and current docs/consumers to reflect both Aggregate fanouts reading retained commands. Preserve historical Plan 202 and pre-cutover review evidence as historical, with a clear current implementation record.

## Implementation sequence

1. Inspect current source and working-tree status, preserve unrelated WIP and reuse or inspect the resolved system-worker Nx task graph. Split production, existing verification and current documentation edits into disjoint responsibilities.
2. Delete the physical table and insert, prune/backfill methods and agent queue overrides. Simplify AggregateVersionChain's page reader now that only `commands` is read. Preserve both queue producer leases and all immutable append checks.
3. Update existing acceptance and owner Workerd scenarios; create no tests, fixtures, runners or configuration. Remove obsolete pending-copy deletion assertions, assert the physical table is absent, retain complete immutable recovery and rollback checks, and exercise agent redelivery/enrollment against retained commands with unchanged projection state and bootstrap.
4. Reconcile ADRs, module READMEs, glossary/pattern/architecture guidance, affected findings and Plan 151. Refresh existing declaration-only storage metadata and architecture source references without running Explorer verification.
5. Format/check only affected files. Run one explicit system-worker dependency graph for `lib`, `ts`, `lint`, `test-workerd-ts`, `test-workerd`, followed by existing `node scripts/verify-plan140.mjs` against current artifacts. Resolve in-scope failures and obtain an independent source/queue audit.
6. Record results, complete current documentation and archive this same plan only after required checks pass, preserving its filename and repairing relative/inbound links.

## Planned files

`+` creates a document; `~` edits an existing file. Direct consumers discovered through the removed schema are included.

```text
zerospin/
  wiki/plans/
    + 203-plan-aggregate-version-chain-agent-fanout.md
    ~ 151-plan-storage-table-review.md
  packages/system-worker/src/AggregateVersionChain/
    ~ aggregateVersionChainDbConfig.ts
    ~ appendEvaluatedCommandsTx.ts
    ~ AggregateVersionChain.ts
    ~ README.md
  packages/system-worker/src/
    ~ affected Aggregate projection/makeFanoutQueue README.md files
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts
    ~ owners.worker.ts if required by the existing scenario
  scripts/
    ~ verify-plan140.mjs
  wiki/
    ~ adrs/{013-aggregate-delivery-history-and-projection-ownership,016-aggregate-original-operations-and-external-work}.md
    ~ glossary.md
    ~ relevant system-worker patterns and current architecture source references
    ~ reviews/storage-tables/aggregate-version-chain-{agent-version-chain-fanout,actor-version-chain-fanout,execution-history}.md
  explorer/src/data/
    ~ schema-snapshot.json
    ~ table-purposes.ts
    ~ architecture.ts
```

## Verification and hard cutover

1. `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p system-worker --nxBail`, preserving required dependencies/caches. Do not run overlapping build graphs or broaden to unrelated WIP.
2. Existing `node scripts/verify-plan140.mjs` verifies full-command immutable recovery, atomic rollback and projection/source timing against current artifacts. Existing Workerd scenarios verify physical schema removal, agent queue cursor advancement without retained-command deletion, duplicate delivery and agent bootstrap. Preserve Service behavior.
3. Check scoped formatting, whitespace, current docs links/source ranges, architecture metadata and stale physical-table references. Queue/subscriber names remain valid. Declaration capture is read-only source extraction; no Explorer tests, typechecks, lint, builds, browser or visual checks are permitted or required.
4. Changed fixed schemas require empty affected AggregateVersionChain storage. No migration, alias, fallback decoder, dual path or compatibility-only test is allowed. No storage reset, commit, provider operation, publication or deployment is authorized. Additional publication `dispositionChainHash` validation remains deferred.

## Verified result

1. The physical agent fanout payload table, duplicate append insertion, agent delivery-reader override, backfill/pruning and their hooks are removed. Both Aggregate fanout queues use the simplified commands-only page reader. Their queue/subscriber names, independent cursor tables, both pre-commit producer leases, source-bound capabilities, fixed-tip delivery and alarms remain. Full immutable command validation and exact duplicate equality are preserved; shared Service pending-payload hooks remain unchanged.
2. Existing Workerd owner verification asserts that neither physical Aggregate fanout payload table exists. The same scenario exercises agent cursor rewind and enrollment through the production agent queue, then checks acknowledgement advances while permanent commands, the agent materialization head and selected history remain unchanged and pending selected publication drains. Agent bootstrap still returns the captured snapshot/private prefix. Existing acceptance checks retain full-command recovery, timestamp equality, rollback and Service behavior. No new tests, fixtures, runners or configuration were created.
3. `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p system-worker --nxBail` passed all **9 tasks**, including **27 Workerd tests across 6 files**. There were zero lint errors and 14 warnings (including an unrelated external-operation queue type-import warning in concurrent WIP). Nx Cloud's access 401 was ancillary to successful local execution. Log: `/tmp/plan203-quality.log`.
4. Existing `node scripts/verify-plan140.mjs` passed all **13 contract acceptance groups** against current artifacts. Log: `/tmp/plan203-plan140.log`. Independent production/queue review found no actionable regression in late enrollment, receipt-gated acknowledgement, retry, alarm recovery, command validation or unchanged Service consumers.
5. ADR 013/016 and current READMEs, glossary, patterns, architecture, storage findings and Plan 151 describe both Aggregate fanouts reading retained commands directly. Current schema inventory has 14 concrete backend Repos and 48 fixed owner/table occurrences; AggregateVersionChain retains three fixed tables plus its ledger. Existing declaration-only capture recorded 58 table declarations without executing source modules. No Explorer verification was run.
6. Scoped formatting, whitespace, current documentation links/source ranges, source metadata and stale physical-table reference checks passed. Historical source evidence remains explicitly historical. Changed fixed schemas require empty affected AggregateVersionChain storage; no compatibility path, migration, reset, provider call, commit, publication or deployment occurred. Concurrent WIP was preserved. Subscriber-table reviews and additional publication hash validation were not part of this implementation.

## Remaining work

None.
