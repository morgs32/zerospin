# Technical async APIs: purpose and naming

**Date:** 2026-10-17

**Status:** Source research and recommendations. No application code was changed;
no tests, builds or browser checks were run.

## Conclusion

Keep `makeAsyncContractReadDb` and `isSoleAsyncSuspension`, including their names.
Keep the asynchronous Drizzle driver. The standalone verification scripts and
compile-only Plan 140 acceptance file were removed on 2026-10-17, including the
script-local `makeAsyncDrizzle` alias. Preserve dependency `mutateAsync`
spelling where that dependency is used; no authored call was found here.
[Read adapter](../../packages/core/src/contracts/make/makeContractReadDb.ts#L295-L318),
[predicate](../../packages/core/src/sessionExecution/isSoleAsyncSuspension.ts#L3-L11),
[production Drizzle driver](https://github.com/morgs32/zerospin/blob/41b548a019ff1e08f65f60c9459e0908a80c64f5/packages/browser/src/Node/openNodeStorage.ts#L57-L82).

The quoted explanation needs one refinement: `makeAsyncContractReadDb` constructs
its adapter synchronously, and the predicate executes synchronously. `Async`
describes the queries it adapts or the suspension it recognizes. For TanStack Query,
`mutateAsync` names the Promise-returning mutation interface.
[Factory](../../packages/core/src/contracts/make/makeContractReadDb.ts#L295-L318),
[predicate](../../packages/core/src/sessionExecution/isSoleAsyncSuspension.ts#L4-L11),
[TanStack reference](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useMutation).

## `makeAsyncDrizzle`

**Removed.** This was a local alias for Drizzle's `drizzle` export from
`drizzle-orm/sqlite-proxy` in `scripts/verify-plan140.mjs`, not a separate
Zerospin API. Removing that standalone script also removed the alias and its
asynchronous-read fixture.

Production `openNodeStorage` imports that same factory as `drizzle`. Its async
wa-sqlite build and `IDBBatchAtomicVFS` execute SQL through a serialized callback
that awaits statement iteration and SQLite stepping. `withRelations` creates a
Drizzle view over the same callback and connection.
[Imports](https://github.com/morgs32/zerospin/blob/41b548a019ff1e08f65f60c9459e0908a80c64f5/packages/browser/src/Node/openNodeStorage.ts#L1-L6),
[storage setup](https://github.com/morgs32/zerospin/blob/41b548a019ff1e08f65f60c9459e0908a80c64f5/packages/browser/src/Node/openNodeStorage.ts#L26-L54),
[SQL execution and relational view](https://github.com/morgs32/zerospin/blob/41b548a019ff1e08f65f60c9459e0908a80c64f5/packages/browser/src/Node/openNodeStorage.ts#L57-L82).

**Recommendation: keep the production driver.** `openNodeStorage` still requires
the asynchronous SQLite callback; no replacement wrapper is needed.
[Actual callback](https://github.com/morgs32/zerospin/blob/41b548a019ff1e08f65f60c9459e0908a80c64f5/packages/browser/src/Node/openNodeStorage.ts#L57-L82).

## `makeAsyncContractReadDb`

**Purpose.** Adapt asynchronous Drizzle relational queries to `IContractReadDb`.
Authored code receives model reads in Effect, without a physical SQLite handle
or write-capable database. The adapter's reads use `Effect.promise`; its
synchronous sibling uses query `.sync()`. Contracts use the same `findFirst` and
`findMany` helpers with either adapter.
[Capability](../../packages/core/src/contracts/make/makeContractReadDb.ts#L144-L160),
[adapter contrast](../../packages/core/src/contracts/make/makeContractReadDb.ts#L269-L318),
[findFirst](../../packages/core/src/contracts/findFirst.ts#L12-L32),
[findMany](../../packages/core/src/contracts/findMany.ts#L12-L32).

Both adapters reuse scope checks for exact model identity, permitted options,
columns and relations. `evaluateContract` further narrows reads to the contract
implementation's declared models before invoking its guard and program.
[Scope checks](../../packages/core/src/contracts/make/makeContractReadDb.ts#L183-L265),
[contract-specific scope](../../packages/core/src/contracts/evaluateContract.ts#L48-L69).

`makeStandaloneWorkerRuntime` constructs this adapter over its persistent
connection's relational view. `executeStandaloneCommand` evaluates with those
reads and applies the returned operations through the execution-owned database.
[Runtime](../../packages/browser/src/StandaloneNode/makeStandaloneWorkerRuntime.ts#L247-L281),
[evaluation and writes](../../packages/browser/src/StandaloneNode/executeStandaloneCommand.ts#L72-L95).

**Transaction boundary.** The adapter owns no transaction. `AggregateNode.executeNext`
holds its `gate` and runs `executeStandaloneCommand` followed by
`retainAggregateFinalTx` inside one outer transaction. `makeNodeSqlGate.transaction` executes `BEGIN IMMEDIATE`,
awaits the body, and commits or rolls back. `executeStandaloneCommand` adds a
nested savepoint around evaluation and resource changes, rolling them back for a
business refusal. Async reads remain inside that transaction.
[Execution and retention](../../packages/core/src/AggregateNode/AggregateNode.ts#L729-L780),
[outer SQL transaction](../../packages/core/src/Node/makeNodeSqlGate.ts#L25-L50),
[savepoint](../../packages/browser/src/StandaloneNode/executeStandaloneCommand.ts#L71-L80),
[rollback and release](../../packages/browser/src/StandaloneNode/executeStandaloneCommand.ts#L131-L150).

**Recommendation: keep the API and name.** `Async` identifies the real driver
boundary without multiplying authored contract APIs. Replacing this adapter with
`makeContractReadDb` would require a genuinely synchronous database implementation.
[Adapter contrast](../../packages/core/src/contracts/make/makeContractReadDb.ts#L269-L318),
[actual storage execution](https://github.com/morgs32/zerospin/blob/41b548a019ff1e08f65f60c9459e0908a80c64f5/packages/browser/src/Node/openNodeStorage.ts#L57-L82).

## `isSoleAsyncSuspension`

**Purpose.** Recognize exactly one Effect failure reason: a defect identified as
`AsyncFiberError`. After savepoint handling, `evaluateSynchronousSavepoint` turns
only this case into `program-must-be-synchronous`; other failures and mixed causes
propagate unchanged. Local aggregate evaluation uses this boundary around
contract evaluation and optimistic operation application.
[Predicate](../../packages/core/src/sessionExecution/isSoleAsyncSuspension.ts#L3-L11),
[classification](../../packages/core/src/sessionExecution/evaluateSynchronousSavepoint.ts#L9-L26),
[local evaluation](../../packages/core/src/aggregateSession/evaluateAggregateSessionCommandTx.ts#L30-L88).

The predicate itself does not cancel fibers or roll back SQL. `withSavepoint`
owns the fenced transaction and rollback. `runSynchronousExit` flushes synchronous
continuations, closes the fence before requesting interruption, and preserves
synchronous cleanup failures. Its documented limit is that asynchronous
finalizers and uninterruptible work can outlive the call.
[Savepoint ownership](../../packages/core/src/drizzle/withSavepoint.ts#L33-L79),
[cancellation and its limit](../../packages/shapes/src/runSynchronousExit.ts#L18-L74).

**Recommendation: keep the API and exact name.** `Sole` matters: suspension plus a
cleanup defect must not become a routine synchronous-program refusal.
`AsyncSuspension` identifies the execution condition being classified.
[Classification](../../packages/core/src/sessionExecution/evaluateSynchronousSavepoint.ts#L18-L26).

## Dependency `mutateAsync`

**Purpose.** The dependency in the quote is unspecified, and no authored
`mutateAsync` or `useMutation` call was found here. TanStack Query is a concrete
example: `mutate` exposes a `void` return, while `mutateAsync` returns a Promise
that resolves with mutation data or rejects on error. Both initiate the mutation;
`Async` distinguishes the caller's completion interface.
[Official reference](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useMutation),
[Promise composition guide](https://tanstack.com/query/latest/docs/framework/react/guides/mutations).

**Recommendation: preserve the dependency name when its Promise interface is needed.**
That does not establish a need to add mutation machinery to Zerospin. Current
`stageAggregateSessionCommand` returns through `session.runSync`; wrapping it in a
Promise solely for `mutateAsync` would add an asynchronous interface around local
staging. It would establish neither remote command admission nor authoritative
execution or retained `outcome`. A dependency Promise means what its supplied
operation promises to return.
[Dependency implementation](https://github.com/TanStack/query/blob/main/packages/react-query/src/useMutation.ts#L215-L235),
[mutation contract](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useMutation),
[current staging](../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts#L93-L127).

## Research limits

These findings describe current working-tree source. The absence of authored
`mutateAsync` calls is a repository-search finding, not a claim about every
external consumer. The original dependency remains unspecified; the TanStack
assessment uses its official documentation and source. No implementation,
migration, plan or runtime verification was performed.
