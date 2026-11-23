# Remove unnecessary command preparation phases

Status: completed 2026-10-09. Implemented under the filename explicitly selected in the approved request, then archived after verification.

## Agreed behavior

Consolidate admission, execution, staging, and projection work into their owning synchronous transactions. Remove transient preparation interfaces and redundant conversions while preserving failure reporting, command ordering, recovery, useful decoders, and async helper names.

1. Batch service admission through `admitServiceCommands({ commands })` and `admitServiceCommandsTx(db, entries)`. Return receipts in input order, including identical stored and within-batch duplicates without another index. Empty batches return `[]`. Compare complete normalized identity. Boundary, identity, ordering, encoding, insertion, and index exhaustion errors roll back the entire batch. Contract refusals remain retained outcomes.
2. In both aggregate and service chains, verify every async continuation against recorded evidence outside SQLite, then admit the whole delivered page with `admitAsyncCommands({ rows })`. Preserve order across owner versions. Direct service execution and browser push use singleton ordinary admission without changing their public protocol.
3. Execute each raw authoritative command in `executeCommandTx(db, { row, aggregateRelease/serviceRelease, key })`. Preserve the outer ordered page loop and execution permit. Read the head inside each transaction, handle repeats and gaps, and evaluate inside the business savepoint. Validate access and run `makeOperations` once. All reads use `commandTx`; collect base and mapper output before application and encode fresh model output once.
4. Preserve skipped admission refusals, business rollback followed by retained failed results, infrastructure abort with preceding page commands committed, historical lineage, frozen external validation, current async ownership, and the single executed-command outbox.
5. Make local aggregate staging one transaction owning command construction, evaluation, application, staged history, inverse operations, and sequence advancement. Keep `prepareAggregateSessionCommand` shared with validation. Check the initialized lifetime before authored execution and before commit.
6. Keep rollback markers private to staging/executor transaction modules. Capture evaluation synchronously, stop suspended fibers before rollback, transport authored defects and interruptions through rollback, then restore the original Cause outside `makeTx`. Preserve ordinary classification and SQL normalization without changing the shared framework.
7. Pass delivered projection rows directly into transactions. Validate envelopes, operations, and decoded commands in delivery order before duplicate skipping. Remove resolved carriers; each page stays atomic.
8. Narrow outbox interfaces: table-backed queues retain raw-table preparation and transactional acknowledgement; custom storage returns delivery rows directly and acknowledges original indices. Remove the additional-row generic/union and shape-only service preparation. Preserve delivery transformation, retries, diagnostics, leases, and cleanup.

## Files

`+` creates, `~` modifies, `−` removes. In-scope callers, fixtures, READMEs, architecture citations, and Explorer trees follow source changes.

```text
zerospin/
  packages/system-worker/src/
    ServiceChain/
      ~ ServiceChain.ts
      − admitServiceCommand/
      + admitServiceCommands/
          admitServiceCommands.ts
          admitServiceCommandsTx.ts
    AggregateVersionRepo/executeCommands/
      ~ executeCommands.ts
      − executeCommandsTx.ts
      + executeCommandTx.ts
    ServiceVersionRepo/executeCommands/
      ~ executeCommands.ts
      − executeCommandsTx.ts
      + executeCommandTx.ts
    ~ aggregateSessionRepo/applyExecutedCommands/
    ~ ServiceActorVersionRepo/execute/
    ~ makeOutboxQueue/makeOutboxQueue.ts
  packages/core/src/aggregateSession/
    − evaluateAggregateSessionCommand.ts
    stageCommand/
      ~ stageAggregateSessionCommand.ts
      ~ stageSessionCommandTx/stageSessionCommandTx.ts
      − applySessionCommandTx/
  wiki/plans/
    + 088-plan-command-transactions.md
```

## Verification

1. Extend the existing SQLite administration harness for service batches: empty input, receipt order, stored/within-batch duplicates, full identity conflicts, mixed outcomes, late rollback, and index exhaustion.
2. Cover both executors: one guard per new command, pre-application reads, committed predecessors, mapper ordering, business rollback, infrastructure abort, repeats/gaps/skipped admissions, original defect/interrupt Causes, and no late writes after suspension.
3. Extend existing core/browser staging coverage for inferred results, lifetime replacement, captured progress, complete rollback, unchanged index, original defect identity, and exactly one appropriate failure notification.
4. Cover malformed projection duplicates and whole-page rollback. Extend existing Workerd fixtures for all-or-nothing async evidence verification and custom outbox indices, diagnostics, concurrent appends, and acknowledgement rollback.
5. Run one scoped Nx graph with dependency builds and caching:

   ```sh
   pnpm nx run-many -p @zerospin/core @zerospin/browser system-worker explorer -t ts lint test:node aggregate-administration:check authorization-provisioning:check outbox:check test:diagrams
   ```

6. Check formatting and diffs only for changed files. Resolve in-scope failures and distinguish concurrent work.

## Constraints and documentation

1. Preserve concurrent work, current aggregate admission naming/direct rows, and the completed aggregate outbox simplification. Leave other active plans untouched.
2. Keep RPC fetching, recorded async verification, and scratch-database acquisition outside SQLite. Preserve optimistic staging's basis check and retry.
3. No persisted-schema changes, storage resets, compatibility aliases, new casts, or browser batching protocol.
4. Update affected documentation, existing patterns, renamed source links, Explorer diagrams, and glossary references after implementation. Introduce no new domain terms. No new ADR is expected.
5. Record evidence and archive only after implementation and every required check completes.

## Implementation outcome

All eight implementation items are complete. The superseded singular service admission methods, prepared executor carriers, local staging evaluator/application carrier, and resolved projection carriers were deleted. Useful input decoders and async preparation helpers remain. Table-backed and custom-storage outbox interfaces now express their actual storage responsibilities.

Review also found that Effect catch/result handlers can mask an authored defect or interruption when its Cause includes a typed failure. The affected core guard, program, mapper, validation, and session-result handlers now classify only pure failures; executor and staging rollback markers preserve mixed Causes. The shared transaction framework is unchanged.

## Verification evidence

1. The approved scoped Nx graph passed with dependency builds and caching. Its final run used `--parallel=1` to prevent Explorer's type-aware lint from overlapping browser declaration rebuilds:

   ```sh
   pnpm nx run-many -p @zerospin/core @zerospin/browser system-worker explorer -t ts lint test:node aggregate-administration:check authorization-provisioning:check outbox:check test:diagrams --parallel=1
   ```

   All 22 tasks passed; 11 used cached results. Log: `/tmp/zerospin-command-transactions-final-pass.log`.

2. Core node tests passed (33), browser node tests passed (67), and diagram tests passed (17). The existing SQLite administration harness passed its extended service batch, executor Cause/order/rollback, and projection coverage. Both authorization-provisioning and outbox Workerd fixtures passed, including async evidence page atomicity and custom-storage acknowledgement behavior.
3. A final import-order-only fixture correction passed scoped lint/format checks, followed by `pnpm nx run system-worker:lint` with its dependency builds. Log: `/tmp/zerospin-command-transactions-final-lint.log`.
4. Formatting and diff checks passed for the 60 explicitly scoped changed files. Source audits verified 331 architecture source records, current hashes, valid line ranges, and affected active architecture links. Deleted runtime helpers have no remaining active callers; links to renamed helpers were repaired, including in relevant historical plans.
5. The scoped lint tasks have no errors. Four existing core curly warnings and four existing worker curly warnings remain in unrelated code. Nx Cloud reported access code 401; every required local task completed successfully.
6. Concurrent Node/schema/RPC/tooling work and unrelated plans were preserved. No persisted schemas, storage resets, compatibility paths, new casts, browser batching protocol, shared transaction framework changes, or ADRs were introduced.

## Remaining work

None.
