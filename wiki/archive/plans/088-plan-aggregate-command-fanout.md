# Aggregate command fanout

## Agreed behavior

1. AggregateChain retains admitted command order and delivers the same complete command rows to each aggregate version. Each version executes independently in that order.
2. The command's retained `aggregateVersion` determines direct execution and retry routing. Remove the separate admission execution-version input and `originalExecutionVersion` field.
3. Version comparison occurs when an execution transaction grants runnable async lifecycle: `command.aggregateVersion === key.aggregateVersion`. Replay retains async emissions with no production lifecycle, as governed by [ADR 001](../../adrs/001-async-replay-retains-output-without-production.md).
4. Remove the original-result paging gate, `IChainInput`, `originalResultSaved`, and the VersionRepo-to-AggregateChain result return. Results and model output publish to AggregateVersionChain; retained async lifecycle survives publication cleanup.
5. Changed fixed schemas require empty storage. There are no compatibility paths or migrations. Preserve unrelated work in the shared checkout.

## Files

`~` modifies existing files or directories; `-` removes obsolete modules.

```text
packages/
  core/src/contracts/ExecutedCommandSchema.ts                         ~
  system-worker/
    src/AggregateChain/                                              ~
      readInputsPage/                                                -
      receiveExecutedAggregateCommands/                             -
    src/AggregateVersionRepo/                                        ~
      deleteDeliveredAggregateMaterial.ts                           -
    src/AggregateVersionChain/aggregateVersionChainDbConfig.ts        ~
    src/asyncOperations/readOperationOutput.ts                       ~
    src/forwardedCommands.ts                                        ~
    src/executeDirectAggregateCommand/                              ~
    src/aggregateSessionRepo/optimistic/makeStagedAggregateCommandOutbox.ts ~
    src/makeFanoutQueue/                                             ~
    src/makeFanoutSubscriber/                                        ~
    checks/aggregate-administration.mjs                              ~
wiki/architecture/                                                  ~
wiki/patterns/system-worker/                                         ~
wiki/glossary.md                                                     ~
explorer/src/data/                                                   ~
```

## Implementation and verification

1. Simplify admission and source paging; remove duplicate execution-version arguments from callers.
2. Simplify version execution, publication, row schemas, and forwarding. Remove unused subscriber-specific queue behavior.
3. Extend the existing aggregate administration fixture to establish independent multi-version execution, original-only async lifecycle, and retry stability. Review publication cleanup and run the existing outbox runtime checks to verify synchronous acknowledgement and rollback.
4. Run scoped Nx typechecking, lint, aggregate administration, and relevant runtime checks with their required dependencies. Reconcile current docs and source citations, then verify the changed files' formatting and diff.
5. Keep ADR 001 governing; update existing terminology and patterns for implemented behavior. Archive this plan after required checks pass.

## Completion

Completed on 2026-10-09. AggregateChain now fans out ordinary retained command rows. Admission and direct execution derive the version from the command, and only the execution transaction compares it with the materializer version to grant runnable async lifecycle. The AggregateChain result return and its duplicated tables are removed. AggregateVersionChain publication acknowledgement deletes delivered model material atomically while retaining async rows for recovery. Current architecture, module docs, patterns, terminology, and Explorer data reflect this behavior.

Validation passed:

- `pnpm nx run-many -t ts lint aggregate-administration:check authorization-provisioning:check outbox:check -p system-worker` with required dependencies. Lint reported no errors and 26 existing warnings. The added regression executes replay before the original version and verifies original-only async lifecycle and stable retries.
- `explorer:test:diagrams` (17 tests) and `explorer:rpc:check` (27 tests).
- Scoped formatting, diff checks, and a current-source search for removed fields and APIs.

An initial build overlapped another session's declaration generation. Rerunning after that build completed passed. Nx Cloud reported an access warning after local checks completed successfully.

## Remaining work

None.
