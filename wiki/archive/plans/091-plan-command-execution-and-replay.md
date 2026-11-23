# Explicit original execution, replay, and command finalization

## Summary

Apply the same design to aggregates and services: each Chain executes original commands sequentially in command-index order, then exposes the contiguous finalized prefix through a replay fanout. Execution and replay have separate subscribers, procedures, and transaction entrypoints.

An infrastructure failure blocks later originals. Pending external async requests do not block them.

## Finalization contract

1. Replace `command.execution` with `command.finalization` throughout command storage, transport, projections, sessions, and consumers:

   ```ts
   type IZerospinSuccess = {
     readonly _tag: 'ZerospinSuccess';
     readonly result: Schema.Json;
   };

   type ICommandFinalization =
     | IZerospinSuccess
     | typeof PublicFailureSchema.Type
     | null;
   ```

2. Add `CommandFinalizationSchema`; final-occurrence schemas require a nonnull outcome. Delete `ExecutionResultSchema`, outcome status fields, result contract version, and execution outcome timestamps. Retain operation, staging, and async lifecycle clocks.
3. Success contains the encoded contract result. Failure contains the public failure directly, including scoped business failures. Existing authored `ZerospinSuccess.schema({code, data})` results remain ordinary encoded values inside `result`.
4. Internal `null` means pending. Non-originating browser recipients continue receiving `finalization: null` for privacy. Admission receipts remain plain admitted-command arrays.
5. Update disposition hashing, observers, Studio, native clients, examples, and fixtures to discriminate the direct tags. Rename command outcome fields only; execution contexts and position counters retain their existing meanings.

## Execution and replay flow

1. **Original delivery:** add `executeCommandOutbox` to each Chain, backed by its existing commands log. Admission stores `finalization: null`. Read the oldest pending command with an explicit one-row limit, routing it by its retained `aggregateVersion` or `serviceVersion`. Add `lastDeliveryFailure` for delivery diagnostics; do not create a pending-work table.
2. **Explicit entrypoints:** each VersionRepo exposes `executeCommandSubscriber` and `replayCommandsFanoutSubscriber(sourceKey)`, backed by `executeCommand`/`executeCommandTx` and `replayCommand`/`replayCommandTx`. Validate original-delivery version identity before evaluation.
3. **Ordered materialization:** before executing original command `n`, replay through `n - 1`. Fetch pages outside the receiver’s execution semaphore and SQLite transaction. Both paths share the durable version head and commit business evaluation, state changes, operations, local finalization, publication intent, and cursor atomically.
4. **Async authority:** only `executeCommandTx` initializes runnable async lifecycle. `replayCommandTx` retains immutable emissions without producer lifecycle. Recorded external responses continue returning as admitted continuation commands.
5. **Original acknowledgement:** return the version’s committed final command as the outbox receipt. Validate its identity and atomically store its finalization on the Chain row, clearing delivery failure without deleting history. Lost receipts recover the existing version result instead of reevaluating the command.
6. **Replay availability:** replace `admittedCommandsFanout` with `replayCommandsFanout`. Its available tip is the index immediately before the first pending command, or the admitted tip when none remain. Replay evaluates each version’s own program and guards; the original outcome controls availability, not the replay outcome. Preserve trusted staging refusals as permanent failures without evaluation or operations.
7. **Duplicates and recovery:** already-materialized rows validate immutable command identity and advance delivery without running again. Original execution must wake replay before its recovery alarm is released. Extend outbox subscriber resolution to receive prepared rows and add an acknowledgement-completion hook for that wake. Activation recovers both queues.
8. **Callers:** replace mixed `VersionRepo.execute(index)` with `awaitCommandResult(index)`: request bounded original progress from the Chain, catch up replay through that index, then recover local output from the existing outbox or VersionChain. Queries, authorization, and flush use the same explicit progress paths. Replay page reads never initiate original execution.
9. Preserve existing public submission APIs. For services, `command.serviceVersion` owns original execution; the outer requested `serviceVersion` selects the returned version result. A differing result version progresses through replay.

## Planned files

Create the implementation record at `wiki/plans/091-plan-command-execution-and-replay.md`. `+` creates, `~` modifies, `−` removes; grouped directories include their affected callers.

```text
zerospin/
  packages/core/src/
    + contracts/CommandFinalizationSchema.ts
    − contracts/ExecutionResultSchema.ts
    ~ contracts/, outbox/, aggregateSession/, serviceSession/
    ~ AggregateNode/, ServiceNode/
  packages/system-worker/src/
    ~ AggregateChain/, ServiceChain/
    ~ AggregateVersionRepo/, ServiceVersionRepo/
    + AggregateVersionRepo/replayCommands/
    + ServiceVersionRepo/replayCommands/
    ~ makeOutboxQueue/, SystemApi/
    ~ version-history and session-projection consumers
  ~ packages/{browser,native,studio,devtools,sdk}/
  ~ packages/core/test/, packages/browser/test/
  ~ packages/system-worker/checks/
  ~ examples/shopping/
  ~ explorer/src/data/ diagram and RPC metadata
  + wiki/plans/091-plan-command-execution-and-replay.md
  ~ wiki/glossary.md, affected patterns and lifecycle documentation
```

## Verification and cutover

1. Test alternating originals across two versions: each command executes once originally, every version advances in order, and replay never issues external work.
2. Test business failure versus infrastructure failure, saved staging refusals, bounded catch-up, duplicate admission/delivery, and replay blocked at a pending prefix.
3. Test interruption after version commit but before receipt acknowledgement, after Chain finalization but before replay wake, and after version-output publication. Verify cold recovery and exact retained results.
4. Test success with null and structured results, scoped failures, browser privacy, optimism until finalization, once-only failure notifications, and service result selection through another version.
5. Run existing Nx outbox, administration, provisioning, core/browser tests, and scoped builds, typechecks, lint, and formatting for affected consumers.
6. Use empty affected server and browser storage. Supply no compatibility aliases, fallback decoders, or migrations.
7. After implementation, reconcile glossary, patterns, READMEs, and architecture workflows; record the ordered-delivery tradeoff in an ADR if the implemented decision meets repository criteria. Archive the plan after implementation and verification are complete.

## Implementation record

1. Worktree: `codex/command-execution-replay`, based on committed `379cb2d5e0`. Unrelated main-checkout work is preserved.
   PR comparison base: `codex/command-execution-baseline` captures that existing local baseline, which was ahead of GitHub's `main` when this implementation began.
2. Implemented separate original delivery and finalized-prefix replay for aggregates and services, exact receipt recovery, original-only async lifecycle, requested service result selection, and direct finalization across storage and consumers.
3. Updated lifecycle READMEs, glossary, patterns, architecture workflows, and their Explorer participant/call-tree/RPC metadata. [ADR 005](../../adrs/005-ordered-original-execution-and-finalized-replay.md) records the ordering decision and throughput tradeoff.
4. Core and browser Node tests passed (41 and 67 tests). Affected package builds, typechecks, lint, Shopping build and successes check, and real outbox recovery checks passed. Nx Cloud access returned 401; local execution completed.
5. Original admission and replay acknowledgement retain their existing queue producer leases, so overlapping empty drains cannot release a newer durable wake. Cold Workerd restarts recover lost original receipts and already-published results without reevaluating model creation or adding producer lifecycle.

## Verification evidence

1. The affected Nx graph ran builds, typechecks, lint, and Node tests for core, browser, native, Studio, Devtools, SDK, system-worker, and Shopping. Core passed 41 Node tests and browser passed 67.
2. `pnpm nx run @zerospin/browser:test:playwright` passed both real browser fixtures, covering session outbox delivery and standalone durability across tabs/restart.
3. `pnpm nx run-many -t ts,lint,outbox:check,aggregate-administration:check,authorization-provisioning:check,shopping-successes:check -p system-worker` passed. The final producer-lease fix then passed `pnpm nx run-many -t ts,lint,aggregate-administration:check,authorization-provisioning:check -p system-worker`.
4. Ordering checks cover alternating originals, version-local replay, original-only async lifecycle, direct null/structured/scoped outcomes, saved staging refusals, infrastructure rollback, prefix blocking, exact receipt identity, and duplicate recovery. Workerd checks cover lost original receipts across a cold restart, acknowledgement completion failure across a cold restart, and exact requested-version results after publication.
5. Browser checks retain outcome privacy, optimistic work until finalization, and once-only failure reporting. Changed fixed schemas require empty affected server/browser storage; no compatibility aliases, fallback decoders, migrations, or new allowed casts were added.
6. Scoped lint has no errors. Four existing core and four existing system-worker curly warnings remain. Nx Cloud access returned 401; required local tasks completed successfully.
7. `pnpm nx run-many -p explorer -t typecheck lint test:diagrams rpc:check --parallel=1` passed all 20 tasks, including clean Explorer lint, 17 diagram tests, and 27 RPC tests. Architecture source hashes, citation ranges, local links, and diagram step annotations match current source.

8. Formatting passed for all 137 changed files; `git diff --check` passed. Implementation and required verification completed on 2026-10-10.

## Remaining work

None.
