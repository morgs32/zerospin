# 115 — Explicit live-query commit invalidation

1. **Implementation status:** implemented and verified in the approved goal on 2026-10-11.
2. **Method shape:** establish inputs, run named domain steps in order, and return the owned result. Helpers own behavior and invariants; moving an entire monolith to a differently named file does not satisfy this plan.

3. **Problem and evidence**
   1. [makeLiveQuery](/Users/morgs32/GitHub/zerospin/packages/live-query/src/makeLiveQuery.ts:1) spends approximately 280 lines inferring query dependencies from private Drizzle structures. A plain select watches its root table while ignoring join dependencies. RAW relational predicates are not completely traversed. When inference finds any table it discards explicit `tableNames`, so an authored complete dependency list cannot repair the missing invalidation. A query can therefore remain stale after a joined or explicitly listed table changes.
   2. It executes the initial subscription query before installing the database listener, leaving a reentrant committed-write gap. Inference also contains forbidden `for (const [key, value] of Object.entries(...))` traversal.
   3. [React useLiveQuery](/Users/morgs32/GitHub/zerospin/packages/react/src/useLiveQuery.ts:20) implements its own recursive key equality by enumerable properties. Distinct Date values and other property-free class values compare equal; a changed key can retain the old captured query. This is a correctness issue, not merely extra code.
4. **Simpler contract**
   1. Query dependency inference is removed. Omitted or empty `tableNames` means rerun on every nonempty committed table-change batch. A nonempty list is an explicit complete dependency declaration and restricts invalidation to those tables. The caller owns completeness, including joins, subqueries, RAW predicates and views. The default is correct for every supported synchronous query and needs no Drizzle private metadata.
   2. One live-query owner binds the query executor, snapshot store and database change listener. Install the listener before the catch-up query when subscribing. Every committed relevant batch reruns the synchronous query once; rollback does not publish uncommitted data. If the driver conservatively emits restored-table changes, rerunning the restored committed snapshot is safe.
   3. Query-key equality uses the existing `es-toolkit` equality utility with documented value semantics for Date/Map/Set/cycles and reference identity for functions, instead of a handwritten partial algorithm. Keys are immutable caller values between renders; a semantic change requires a new key value rather than mutating the previously captured key in place. Keep the current React rule that callers change the key when the captured query changes; do not turn function recreation on every render into resubscription.
5. **Parent shape and procedure contracts**

   ```ts
   function makeLiveQuery<Result>(props: ILiveQueryProps<Result>) {
     const execute = bindSynchronousQuery(props.query);
     const invalidation = decodeQueryInvalidation(props.tableNames);
     const store = makeQuerySnapshotStore(execute);
     return subscribeToCommittedQuery({
       client: props.client,
       execute,
       invalidation,
       store,
     });
   }
   ```

   1. `bindSynchronousQuery` binds the supported query's `.all()` or `.sync()` execution method. An unsupported executor fails with the existing query error at the boundary rather than failing inside a table-change callback. Supported result types and overloads remain intact.
   2. `decodeQueryInvalidation` normalizes an optional nonempty list into a set, or returns the all-commits policy. It does not inspect query internals. Invalid authored entries fail before listener installation; order/duplicate entries do not create distinct policies.
   3. `makeQuerySnapshotStore` retains current value/error/timestamp semantics. A query failure is published through the store without destroying its previous successful data or the database listener. Store observers cannot change transaction results.
   4. `subscribeToCommittedQuery` installs listener, executes a catch-up read, reacts to relevant committed batches and returns an idempotent unsubscribe. It owns reentrant notifications so writes triggered by observers cannot be silently dropped or create uncontrolled recursion. There is no timer or polling owner.
   5. React `useLiveQuery` and `useLiveQueryOnDb` own one query store per database/key/dependency policy and only subscribe after commit through their current external-store hook. An uninitialized session preserves the existing typed `session-store-not-initialized` refusal. Error-boundary unmounting removes its listener; reinitializing and remounting reads the current bound store. A new Date-valued key captures the new query.

6. **Intentional changes and removals**
   1. Delete private Drizzle schema/relation/filter traversal, `getWatchedTableNames` and related internal type casts/imports. Remove handwritten `stableKeyEquals`. Keep synchronous select/relational query support and existing public generic result inference.
   2. This deliberately changes omitted dependency behavior from incomplete inferred subsets to all committed tables. Explicit nonempty lists are now honored even when a root table can be inferred. Some callers may rerun more frequently; correctness is the default and performance narrowing is an explicit authored contract.
   3. Update direct callers with complete lists only where all dependencies are known from their current queries. Do not guess lists to retain old performance. Native/browsers use the same actual table-change batches; no wire or fixed schema changes are required.
7. **Source hierarchy** (`+` create, `~` modify, `-` delete; rooted at `zerospin/`)
   ```text
   ~ packages/live-query/src/makeLiveQuery.ts
   ~ packages/react/src/useLiveQuery.ts
   ~ packages/react/src/useLiveQueryOnDb.ts
   ~ packages/react/package.json
   ~ pnpm-lock.yaml
   ~ packages/devtools/src/useLiveQueryOnDb.ts
   ~ packages/studio/src/AgentPreview.tsx
   + packages/live-query/README.md
   ```
   No new source file is required: the complete owner is small enough to remain one module, with tiny normalization/execution steps inline if clearer. Remove private inference code rather than extracting it.
8. **Ordered implementation**
   1. Verify the complete set of direct `makeLiveQuery`/React/Devtools callers and driver commit notification contracts. Coordinate the core transaction/operation owner; do not change driver transaction semantics to accommodate the hook.
   2. Replace inference with explicit all/list policy and install-before-catch-up subscription ordering. Make observer-triggered reentrant commits deterministic under the one query owner.
   3. Declare the React package's new direct es-toolkit dependency through the package manager using the existing workspace version policy; React currently has no direct dependency. Replace React key equality, preserve uninitialized-session refusal and StrictMode subscription semantics, and update exact direct callers/docs to the intentional contract.
   4. Delete unused Drizzle internal imports/traversals/casts and reconcile exports/documentation. No compatibility inference path remains.
9. **Acceptance and existing verification**
   1. Without a list, changing any joined, subquery or RAW dependency refreshes the result. With a list, every listed table invalidates even when absent from the root select; unrelated table changes do not. Empty batches and rolled-back values never yield a stale/uncommitted snapshot.
   2. A committed write triggered during subscription/catch-up or an observer callback is reflected deterministically. Unsubscribe removes the listener; StrictMode setup/cleanup does not leak duplicate listeners. Query failure can recover on a later commit.
   3. Changing Date/Map/Set values in the query key captures the new query under the documented equality semantics; equal keys preserve the stable query store. Uninitialized-session refusal, listener cleanup and reinitialization remain correct.
   4. Resolved live-query and React targets are `lib`, `ts`, `lint`; use existing Nx tasks plus affected Devtools/Studio targets. No permanent live-query or React test/check target exists. Reuse actual existing SQLite drivers/Drizzle select and relational query APIs and existing application queries for join/list/RAW/rollback/reentrant evidence; no new test files, fixtures, runner or configuration. Browser React lifecycle evidence requires the actual existing app seam and must not be inferred solely from an in-memory query exercise.

10. **Cross-plan ownership:** [105](105-plan-immutable-authored-declarations.md) owns immutable authored declarations; [106](106-plan-canonical-authored-manifest-projections.md) owns manifest/lock projections; [107](107-plan-contract-evaluation-phases.md) owns prepared contract inputs/evaluation; [108](108-plan-model-operation-codecs.md) owns strict resource and operation codecs; [109](109-plan-bound-database-definition.md) owns schema/index provisioning; [110](110-plan-sqlite-execution-and-commit-observation.md) owns committed SQL/table notifications. Use those owners where applicable and do not recreate them in this refactor. The server service-protocol/result-journal proposals own their wire/cursor hard cutovers.

11. **Documentation lifecycle:** after implementation, reconcile affected package READMEs, architecture citations and `wiki/glossary.md` against actual source. Create or supersede an ADR only for a qualifying implemented decision with a consequential tradeoff; do not manufacture an ADR for extraction. Preserve completed Plans 100/103 as historical evidence. Archive this plan only after its acceptance criteria and available verification are complete, recording remaining environmental limitations accurately.

## Implementation progress — 2026-10-11

1. Real WASM inline probe passed joined-query all-commit invalidation, explicit table-list filtering, reentrant store-triggered commits, idempotent unsubscribe and recovery after observer errors. React semantic key equality now uses es-toolkit; mounted normal application invalidation is recorded below, with specialized lifecycle/key cases still pending. No new test files, fixtures, runners, or configuration were created.

### Integration update — 2026-10-11

Live queries share one ref-counted database observer installed before catchup; declared table sets are normalized, empty/omitted sets observe all commits, and reentrant reads coalesce. React/DevTools dependencies use structural equality with function identity. Real WASM query/store probes passed; specialized mounted React lifecycle/key behavior remains required.

### Additional bounded runtime evidence — 2026-10-11

The real WASM driver and an existing TicTacToe Drizzle query passed query execution failure and recovery (`/tmp/zerospin-goal-110-115-extra-inline.log`). A failing read after a committed write publishes the error while retaining the exact prior successful data and timestamp; the write remains committed and the observer remains subscribed. The next relevant successful commit publishes current rows and clears the error. Unsubscription prevents later query publication. This checks query execution failure separately from an observer callback throwing; it does not establish mounted React lifecycle behavior. No new files, fixtures, runners, configuration or production changes were required.

### Actual mounted committed board updates — 2026-10-11

The existing TicTacToe [Board](../../../examples/tic-tac-toe/src/app.tsx) reads its current selected game through `useLiveQuery` with an actual Drizzle relational query and omitted `tableNames`. Native Chrome inspection at `http://127.0.0.1:53020/` observed two same-game tabs update from an empty board to `XO.......`, then `XOO.X....`, then terminal `XOO.X...X`/`X wins!` after genuine local moves and backend computer continuations. Closing only the second tab left the survivor updating; reopening the second tab displayed the same current graph. This establishes normal mounted React query invalidation/publication for committed session projection changes, including changes initiated in the other tab and by the backend.

Selecting a new game in the second tab then rendered `O...X....` there while the original tab retained its terminal game. Read-only server inspection matched each displayed selected resource/checkpoint, original public6/private4 and new public3/private2, with all nine journal hashes independently derived from genesis. [Plan118](118-plan-version-result-owner.md) records the precise game/Node identities, counts and `/tmp/zerospin-goal-mounted-retry-browser-{baseline,private-baseline,independent-owners}.log` evidence. No query listener count, key replacement or rollback boundary was measured in this UI run. The example root does not use StrictMode, and ordinary board updates do not establish StrictMode setup/cleanup, Date/Map/Set key equality, uninitialized-session transitions or listener disposal after tab SQL closes. DevTools was not mounted.

### Actual native committed projection publication — 2026-10-11

The current native app automatically published the authoritative graph after a real offline winning command survived OS process close/reopen and an app update. Restoring the backend finalized the exact retained original at public6/node10, cleared the single optimistic operation and converged Node/session rows and the rendered native board to `XOO.X...X`. A second real game subsequently reached `O...X....` at public3/private2 while the complete old winner rowsets stayed unchanged. [Plan118](118-plan-version-result-owner.md#actual-native-offline-recovery-and-independent-owner--2026-10-11) records the retained IDs, raw input, hash and read-only SQL evidence. This is actual native projection/publication evidence; it adds no React StrictMode, query-key equality, listener-count or callback/SQL-close timing measurement.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Authorized mounted StrictMode and semantic-key verification — 2026-10-11

The human authorized disposable `/tmp` verification fixtures. `/tmp/zerospin-framework-goal-data-core-UAv4C2/react-live-query.mjs` mounts the production React hooks through the installed React19.2.7/test-renderer19.2.7, backed by the real WASM SQLite driver, actual Drizzle resource/session tables and captured TicTacToe resource data. Its invocation exited0; `/tmp/zerospin-framework-goal-data-core-UAv4C2/react-live-query.log` records `PASS`.

Date, Map and Set keys each preserved the query/store and subscription count for equal cloned values and recreated callbacks, then rebuilt the query for changed values and read the changed key through actual SQL. StrictMode retained exactly one active database listener after every mounted update; the first mount/update phase balanced seven attachments with seven detachments. A committed board update rendered its new SQL result, and unmount left zero listeners. An actual uninitialized session raised `session-store-not-initialized`; its error boundary detached the listener. Reinitializing the real session and remounting restored the bound query, and the final unmount again left zero listeners. The plan's earlier empty-snapshot wording was inaccurate: both the original and implemented hook preserve this typed refusal, with no disabled-session API.

These controlled checks establish the specialized mounted React lifecycle/key criteria in a Node test-renderer host. The separate genuine Chrome application observations above establish browser integration; the controlled test does not claim Chrome scheduling or Worker/storage close ordering. Earlier real SQLite checks establish join/list/RAW dependency invalidation, rollback, reentrant subscription/observer commits and failure recovery. Source/consumer gates and current documentation audits passed as recorded above. No permanent test, fixture, runner or configuration was added.

## Remaining work

None.
