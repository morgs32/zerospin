# AggregateVersionChain commands and history-backed actor fanout

**Date:** 2026-10-15

**Status:** Complete on 2026-10-15. Implementation, current documentation and required verification passed.

**Related:** [Plan 151](../../plans/151-plan-storage-table-review.md), [actor fanout finding](../../reviews/storage-tables/aggregate-version-chain-actor-version-chain-fanout.md), [retained command finding](../../reviews/storage-tables/aggregate-version-chain-execution-history.md), [ADR 013](../../adrs/013-aggregate-delivery-history-and-projection-ownership.md), [ADR 016](../../adrs/016-aggregate-original-operations-and-external-work.md), [Plan 200](200-plan-aggregate-operation-context.md).

## Problem and approved behavior

1. `AggregateVersionChain.actorVersionChainFanout` duplicates the exact complete evaluated command already retained permanently in the same database. Its recipient progress lives separately in `actorVersionChainFanoutSubscribers`. Delete this redundant payload table and use the actor queue's existing history-reader fallback. Introduce no replacement marker, pointer, envelope or queue implementation.
2. Rename AggregateVersionChain's physical `executionHistory` table and its schema/table property to **`commands`**. Every retained row remains the complete immutable `IEvaluatedCommand` approved in Plan 200. The bound AggregateVersionChain identifies the evaluating release; each command's `aggregateVersion` remains its original admission release. Preserve all 16 fields, canonical `id`, ordered operations, exact duplicate equality and `outcome: { result, finalizedAt }`.
3. Keep the `actorVersionChainFanout` queue capability/name, source-bound receiver, actor subscriber progress, producer lease, fixed-tip paging and durable alarm recovery. Actor acknowledgement advances only after AggregateActorVersionRepo commits resources, materialization progress and complete pending selected publication. It never deletes retained commands and does not wait for later selected publication to its Chain.
4. Remove actor-only payload insertion, delivery-reader override, backfill and pruning. Late actor activation catches up from retained commands and enrolls its committed cursor; direct retained-command delivery covers the catch-up/enrollment interval. Lost receipts redeliver the immutable command without reapplying committed positions.
5. Keep the agent payload table and its current independent acknowledgement/backfill/pruning behavior. Its history dependency reads renamed `commands`. ServiceVersionChain and its `executionHistory` remain unchanged. No second table-purpose review is authorized.
6. Amend the existing governing ADR 013 rather than creating a successor for the whole ownership model. Reconcile ADR 016, current module/pattern/glossary guidance, the two findings, Plan 151 and current storage metadata. Distinguish history-backed actor delivery from complete pending publication in resource-owning Repos.

## Implementation sequence

1. Preserve all existing uncommitted work. Inspect current callers and resolved Nx task configuration; assign disjoint source, existing verification and documentation ownership.
2. Change the AggregateVersionChain schema, append transaction, retained-command reader/paging and actor fanout wiring. Preserve command validation, transaction boundaries, agent pending publication and both pre-commit producer leases. Avoid naming collisions between the `commands` table and incoming command arrays.
3. Update existing acceptance and Workerd scenarios without creating tests, fixtures, runners or configuration. Assert physical `commands` exists and the removed physical tables do not; retain full immutable recovery, rollback, actor/agent projection and timestamp assertions. Exercise history-backed actor delivery and late enrollment through the existing production queue seam where practical.
4. Update current docs/ADR/pattern guidance and Plan 151 with implemented behavior; retain historical names only when explicitly describing the prior design. Refresh existing declaration-only schema metadata and affected architecture source hashes/ranges without any Explorer verification.
5. Format/check only affected files. Run one explicit system-worker Nx dependency graph for `lib`, `ts`, `lint`, `test-workerd-ts` and `test-workerd`, then existing `node scripts/verify-plan140.mjs` against current artifacts. Investigate and resolve in-scope failures; do not broaden to unrelated WIP or Explorer.
6. Review the resulting diff and source references, record verification evidence, mark Remaining work None and archive this same plan, repairing inbound and relative links.

## Planned files

`+` creates a document; `~` modifies an existing file. Actual direct consumers discovered through the schema rename are included.

```text
zerospin/
  wiki/plans/
    + 202-plan-aggregate-version-chain-commands-and-actor-fanout.md
    ~ 151-plan-storage-table-review.md
  packages/system-worker/src/
    AggregateVersionChain/
      ~ aggregateVersionChainDbConfig.ts
      ~ AggregateVersionChain.ts
      ~ appendEvaluatedCommandsTx.ts
      ~ README.md
    ~ affected Aggregate owner and makeFanoutQueue README.md files
  packages/system-worker/test/migratable-do-repo/
    ~ system-repo-activation.workerd.spec.ts
    ~ owners.worker.ts if existing scenarios require it
  scripts/
    ~ verify-plan140.mjs
  wiki/
    ~ adrs/{013-aggregate-delivery-history-and-projection-ownership,016-aggregate-original-operations-and-external-work}.md
    ~ glossary.md
    ~ patterns/system-worker/{i-fanout-repo.ts,repo-lifecycle.md}
    ~ affected current architecture source metadata
    ~ reviews/storage-tables/aggregate-version-chain-{actor-version-chain-fanout,execution-history}.md
    ~ affected current Aggregate storage findings
  explorer/src/data/
    ~ schema-snapshot.json
    ~ table-purposes.ts
    ~ architecture.ts if current storage descriptions require it
```

## Verification and hard cutover

1. One scoped Nx graph: `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p system-worker --nxBail`, retaining dependency execution and caching. Reuse the resolved configuration while unchanged; do not run overlapping build graphs.
2. Existing `node scripts/verify-plan140.mjs` validates contract/retention/projection semantics. Use existing scenarios for immutable full-command equality, no fanout resurrection, actor projection receipts, retry/late catch-up and source/projection timestamps. Preserve Service expectations and the remaining agent payload lifecycle.
3. Scan production Aggregate consumers for stale `executionHistory` references and physical actor payload access. The actor queue capability and subscriber-table names remain valid. Check scoped formatting, whitespace, local docs links/source ranges and declaration metadata consistency. No Explorer checks are allowed or required.
4. Changed fixed schemas require empty affected AggregateVersionChain storage. Add no migrations, decoder fallback, alias, dual table or compatibility code. No storage reset, commit, deployment, publication or provider operation is authorized.

## Verified result

1. AggregateVersionChain retains immutable full evaluated `commands` and the existing independent agent pending payload. The actor payload table, actor insert, delivery-reader override and backfill/pruning hooks are removed. The actor queue/subscriber capabilities, cursor state, both producer leases and alarm recovery remain. The gap error now names `aggregate-commands-gap`; there are no aliases, compatibility paths or migrations.
2. Existing owner Workerd verification checks the full 16-column `commands` table and absence of physical `executionHistory` and `actorVersionChainFanout`. Late actor activation and deliberately stale source acknowledgements exercise production history-backed delivery; acknowledgements advance while retained commands and materialization progress remain unchanged. Existing acceptance checks preserve immutable full-command recovery, duplicate agent no-resurrection, rollback and source/projection timestamps. Service `executionHistory` remains unchanged. No new tests, fixtures, runners or configuration were created.
3. `pnpm nx run-many -t lib ts lint test-workerd-ts test-workerd -p system-worker --nxBail` passed all **9 tasks**, including **27 Workerd tests across 6 files**. There were zero lint errors and 13 existing warnings. Nx Cloud's workspace-access 401 was ancillary to successful local execution. Log: `/tmp/plan202-quality.log`.
4. Existing `node scripts/verify-plan140.mjs` passed all **13 contract acceptance groups** against current artifacts. Log: `/tmp/plan202-plan140.log`. The independent read-only production/queue audit found no actionable regression in late enrollment, retry, alarm recovery, retained-command equality or the remaining agent lifecycle.
5. ADR 013 and ADR 016, current module/glossary/pattern/architecture guidance, affected findings and Plan 151 describe the implemented ownership. The existing declaration-only capture records 14 concrete Repos and 59 table declarations; it does not execute source modules. AggregateVersionChain has four fixed tables plus its ledger; Plan 151 now records 49 fixed owner/table occurrences across 14 classes. No Explorer verification was run.
6. Scoped formatting, whitespace, current documentation links/source ranges, architecture source metadata and stale-reference scans passed. Historical review evidence preserves its prior names and retired source references. Changed fixed schemas require empty affected AggregateVersionChain storage. No storage reset, provider call, commit, publication or deployment occurred; concurrent WIP was preserved. No second table-purpose review or additional publication hash validation was performed.

## Remaining work

None.
