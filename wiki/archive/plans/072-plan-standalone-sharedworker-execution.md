# Standalone sessions with SharedWorker execution

## Summary

Keep synchronous optimistic staging in each tab. One SharedWorker owns the persistent SQLite database, evaluates guards and contract programs against authoritative state, and publishes committed outcomes through the existing aggregate-session reconciliation flow. Standalone sessions establish no backend connections.

## Public API

1. Keep module-level session declarations. `makeStandaloneSession` declares models, contracts, claims schema, application layer, and a required `sharedWorker` factory. Remove constructor `key`, `claims`, and `resources`.

2. Replace `useInitializeStandaloneSession` with:

   ```ts
   useStandaloneSession({
     session: roomSession,
     claims,
     backupPath: RoutePattern.parse('/rooms/:aggregateId/:participantId'),
     resources: initialResources, // optional seed
   });
   ```

   `session.initialize(...)` accepts the same instance arguments outside React. Machinery validates claims and pattern parameters, then calls `createHref`. RPC carries the pattern’s source string; the worker independently derives and verifies the path.

3. Extend `makeSharedWorker` with a literal `standaloneSessions` map keyed by session name. Values contain directly imported executable declarations and worker-safe layers.

4. Introduce read-only, model-scoped helpers:

   ```ts
   const current =
     yield *
     findFirst({
       db,
       model: game,
       where: { id: payload.id },
     });
   ```

   Provide `findFirst` and `findMany`, typed object filters, and typed `with` relations. Preserve decoded row inference. Writes continue through emitted model operations. Hard-cut contract programs, guards, mappings, and owner guards to this interface; retain synchronous UI/live-query interfaces.

## Implementation

1. **Storage and claims:** derive persistent identity from the generated backup path and declaration scope, excluding incidental claims and compiled worker version. Equal paths within that scope share storage. Bind one aggregate ID to the database; reject conflicting aggregate IDs. Validate full claims per attachment and retain each invocation’s original claims.

2. **Ownership:** hold the lifetime Web Lock on the persistent namespace. Different worker builds must serialize ownership of that storage. Distinguish legitimate ownership waiting from worker startup failure; close SQLite before releasing the lock.

3. **Execution:** durably journal accepted invocations, then drain them in order. Hold the node serialization gate through `BEGIN IMMEDIATE`, guard/program evaluation, operation application, terminal retention, checkpoint updates, and `COMMIT`. Publish afterward. Declared business failures roll back command mutations and retain failure outcomes; defects or persistence failures roll back execution and leave accepted work pending.

4. **Shared execution primitives:** compose guard/program Effects without nested synchronous runners. Enforce synchronous execution at existing tab/server boundaries; allow asynchronous SQLite reads in the worker. Reuse operation codecs, constraints, and delta collection through synchronous/asynchronous adapters over one physical database. Preserve declared-model scope through relation traversal.

5. **History and reconciliation:** reuse snapshot, acceptance, ordered subscriptions, deduplication, and pending-invocation re-evaluation. Advance regular aggregate/execution indexes and disposition hashes for successes, failures, and successful no-ops. Share hash tuple encoding between server and browser implementations.

6. **Lifecycle:** semantically changed claims or paths dispose and reattach the binding; ordinary rerenders do not. Seeds apply only on first creation or reset. `reset()` reuses captured initialization arguments, including after failed initialization. It atomically reseeds history/resources, rotates `nodeId`, fences old capabilities, and makes all attached tabs rebuild automatically.

7. **Packaging and cleanup:** export the unbundled ESM worker entry so app declarations and framework execution share one core/Effect instance. Keep the complete build-time bundle solely for version fingerprinting. Replace standalone immediate execution with ordinary staging; remove obsolete SQL-forwarding backups, `BrowserBackup`, the dedicated backup-worker package, and their callers/configuration.

Primary implementation files (`+` new, `~` modified):

```text
zerospin/
├─ packages/core/src/
│  ├─ contracts/
│  │  ├─ + findFirst.ts
│  │  ├─ + findMany.ts
│  │  └─ + make/makeContractReadDb.ts
│  └─ AggregateNode/
│     └─ ~ AggregateNode.ts
├─ packages/browser/
│  ├─ src/
│  │  ├─ ~ makeSharedWorker.ts
│  │  ├─ ~ makeStandaloneSession/makeStandaloneSession.ts
│  │  └─ + StandaloneNode/makeStandaloneSharedWorker.ts
│  └─ checks/
│     └─ + standalone-session.mjs
└─ packages/react/src/
   └─ + useStandaloneSession/useStandaloneSession.ts
```

Also update affected exports, execution callers, authored reads, build configuration, existing checks, and documentation.

## Verification and defaults

1. Extend existing browser and React checks for query/result inference, relation scope, pattern typing, changed bindings, initialization ownership, and reset rebuilding.

2. Add an independent Playwright/Vite fixture and Nx `standalone-session:check` task using real SharedWorkers and IndexedDB. Verify concurrent increments, ordered assignments, authoritative guard rejection, rollback, retry deduplication, restart persistence, path isolation, differing non-path claims, and stale requests during reset. Assert no backend requests or WebSocket connections.

3. Run scoped Nx build, type, lint, and behavioral checks for affected packages and consumers. Verify SDK-created declarations and application layers execute successfully in the bundled worker.

4. Preserve ordinary standalone contract capabilities; external async workflows remain outside this change. Use fresh storage for changed fixed schemas, with no compatibility migration. After implementation, reconcile glossary/architecture documentation, record qualifying implemented decisions, and archive the completed plan.

## Outcome

Implemented and verified on 2026-10-08.

1. Standalone declarations initialize with typed claims/path/seeds, stage synchronously
   per tab, and execute durably in the application's SharedWorker. Model-scoped
   Effect reads, ordered acceptance/draining, immutable outcomes, index/hash progress,
   and existing projection reconciliation share the framework's execution primitives.
2. Stable storage identity excludes incidental claims and worker builds. Lifetime
   ownership, original invocation claims, aggregate binding, reset fencing, and
   failed-initialization recovery are verified. Changed declarations require explicit
   empty-storage reset; failed reseeding rolls back schema replacement, resource/history
   changes, and node identity. No compatibility decoder or translation migration remains.
3. Obsolete immediate execution, SQL-forwarding backup APIs, backup status fields,
   and the dedicated backup-worker package are removed. Public worker execution is
   unbundled ESM; the complete bundle remains only a framework fingerprint input.
4. All 31 scoped framework/consumer build, type, and behavioral tasks passed. Existing
   browser and React checks cover read/result inference, relation scope, semantic
   bindings, ownership, and synchronous staging. The real Vite/Playwright fixture
   covers concurrency, ordering, business failures, rollback, deduplication,
   full browser restart, path/claims identity, no-ops, reset fencing/rebuilding,
   startup ownership waiting, declaration changes, and failed reset atomicity.
   It observed no backend requests or WebSocket connections. Its final extended
   regression and browser type check also passed.
5. Nine scoped lint tasks and scoped formatting passed, with no warnings in task-owned
   files. Warnings in unrelated work remain. Release verification passed for all 18
   package artifacts, including worker exports and bundle/WASM fingerprinting;
   isolated patch/minor/major versioning rehearsals passed. Nx Cloud's existing 401
   did not prevent successful local checks.
6. Glossary, architecture, patterns, package documentation, and source citations are
   reconciled. [ADR 004](../../adrs/004-standalone-authority-and-storage-scope.md)
   records the governing ownership and storage decisions; the
   [standalone workflow](../../architecture/browser/StandaloneSharedWorkerExecution.md)
   describes the implemented behavior.

## Remaining work

None.
