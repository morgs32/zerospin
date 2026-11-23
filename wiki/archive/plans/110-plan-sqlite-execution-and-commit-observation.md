# 110 — SQLite execution and committed observation

Status: Implemented and verified in the approved goal on 2026-10-11.

## Problem and retained invariants

1. [SqliteSession](../../../packages/core/src/drizzle/SqliteSession.ts) has two almost identical statement engines for array/object rows. Each binds parameters, classifies capturable writes/raw SQL, steps/finalizes statements, records committed SQL, flushes table changes and handles observer ordering. Root transaction and savepoint methods separately manipulate the same statement capture stack.
2. [makeInMemorySQLite3](../../../packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts) separately owns pending table names and commit detection. This separation is required at the SQLite hooks: observers must run after stepping finishes. The statement/session layer must clearly own when a committed SQL batch is published and when table observers can reenter.
3. Use one statement execution procedure with an explicit row representation, and one commit-observation owner for SQL capture stack/publication ordering. This removes duplicated execution policy; it does not replace SQLite transactions with a callback framework or weaken synchronous fencing.

## Required behavior and error policy

1. Bind parameters and finalize every prepared native statement exactly once on success/failure. Preserve arrays, objects, first row and run/changes return behavior. Validate supported parameter representations and copy mutable byte parameters when retaining a committed statement batch.
2. Root COMMIT publishes only its successful statements. A released savepoint merges statements into its parent; a rolled-back savepoint discards its SQL statements. Root rollback discards the complete uncommitted capture. Observer failure cannot undo committed work or change the transaction result.
3. Capture permitted Drizzle writes and the explicit deferred-reference pragma. While capture is enabled, retain the actual supported raw-SQL policy rather than expanding it through a substring heuristic. Native statement/query metadata determines classification at the statement boundary. This policy is for local replication capture, not a claim that arbitrary SQL is a secure public query API.
4. Publish committed SQL before notifying committed-table observers. Suppress reentrant table flushing while either an SQL transaction or a SQL observer is active. Observers can then synchronously query committed data; observer queries must not publish a second incomplete batch. SQLite update/commit hooks remain bookkeeping only, with no prepare/step/reentrant query.
5. Table notifications may conservatively include a table touched by a rolled-back savepoint if the surrounding transaction commits; they must never omit an actually committed change or announce uncommitted intermediate rows. The supported client boundary `flushTableChanges(restoredTableNames)` explicitly supplies restored table names after the live database is ready. This is a notification contract; current source has no binary database backup/restore API or restoration caller to verify.
6. [makeTx](../../../packages/core/src/drizzle/make/makeTx.ts), [withSavepoint](../../../packages/core/src/drizzle/withSavepoint.ts) and [fenceTransaction](../../../packages/core/src/drizzle/fenceTransaction.ts) retain their current correctness ownership: synchronous callback execution, transaction-owned handle fencing, suspended fiber cancellation/dispatcher flush, rollback and full original Cause propagation. They are reviewed and remain justified. Do not add a generic callback runner or normalize their full Cause to fit an observer refactor.
7. Keep native/browser implementations of the `ISqliteClient` contract compatible at this internal hard cutover. No persistence schema change is required by this plan; no storage deletion, fallback path or new adapter is proposed.

## Complete proposed parent shapes

```ts
function executeStatementRows(props: IStatementExecutionInput) {
  const parameters = bindStatementParameters(props.parameters);
  const capture = props.observation.classifyStatement(
    props.sql,
    props.metadata,
  );
  try {
    const rows = stepAndCollectRows(
      props.client,
      props.sql,
      parameters,
      props.rowMode,
    );
    if (capture) props.observation.record({ sql: props.sql, parameters });
    return rows;
  } finally {
    props.observation.flushWhenSettled();
  }
}

function transaction<T>(work: (tx: ISqliteTransaction) => T): T {
  const tx = makeTransactionHandle();
  beginNativeTransaction();
  observation.beginCapture();
  try {
    let result: T;
    try {
      result = work(tx);
      commitNativeTransaction();
    } catch (cause) {
      rollbackNativeTransactionAndDiscardCapture(cause);
      throw cause;
    }
    // Publication isolates observer failures and is outside the rollback catch.
    observation.commitCapture();
    return result;
  } finally {
    observation.flushWhenSettled();
  }
}

function savepoint<T>(work: (tx: ISqliteTransaction) => T): T {
  const tx = makeNestedTransactionHandle();
  openNativeSavepoint(tx);
  observation.beginCapture();
  try {
    const result = work(tx);
    releaseNativeSavepoint(tx);
    observation.releaseCapture();
    return result;
  } catch (cause) {
    rollbackNativeSavepointAndDiscardCapture(tx, cause);
    throw cause;
  }
}
```

1. `stepAndCollectRows` owns prepare/bind/step/finalize and selects array-versus-object collection at the row boundary. It does not duplicate write classification/capture/notification policy by row mode.
2. Observation methods own the state they mutate: capture stack, notification depth and exact publication order. Keep native BEGIN/COMMIT/ROLLBACK inline in transaction methods where clearer. The sketches' rollback procedures must preserve primary rollback infrastructure failure plus captured execution diagnostics; never double rollback after a successful COMMIT if a postcommit observer fails.
3. The concrete implementation may keep the observation owner in the session file when that makes lifetime obvious. Do not add forwarding wrappers or a global registry. The SQLite client still owns update hooks and its listener set; the session observation owner coordinates one connection's execution.

## File hierarchy and removal

Legend: `+` create, `~` modify, `-` delete.

```text
zerospin/
├── packages/core/src/drizzle/
│   ├── ~ SqliteSession.ts
│   ├── + executeStatementRows.ts
│   ├── + makeCommitObservation.ts
│   ├── ~ types.ts
│   ├── ~ make/makeInMemorySQLite3/makeInMemorySQLite3.ts
│   └── ~ README.md
├── packages/native/src/ — verify matching client/commit hooks
├── packages/browser/src/ — replica handoff and restore observers
└── wiki/
    ├── ~ architecture/ — committed SQL/table observation sequence
    └── ~ glossary.md — postimplementation reconciliation
```

1. Delete duplicated `executeValuesRows`/`executeObjectRows` statement engines and their copied capture-policy branches. Keep one supported parameter conversion and one row collector dispatch.
2. Browser replica bootstrap and connected-worker/native owner plans own who subscribes and when storage closes. This plan owns connection-local commit observation; consumers must detach observers and drain their work before closing a connection. [109](109-plan-bound-database-definition.md) owns schema/provisioning, not runtime observation.

## Sequence and existing verification

1. Implement one statement engine, retaining exact query metadata and row representations. Then move capture/observer coordination into its one owner and convert root/savepoint methods. Preserve the existing driver contract until all in-scope adapters convert in the same change.
2. Reuse real WASM/sql.js/native seams already present to check root/savepoint commit and rollback, multiple statements, late parameter mutation, observer throws/reentry, table listener order and explicit restored-table notification. Inspect browser committed-SQL handoff callers, which require SQL publication before session listeners see locally staged commands.
3. Create no tests, fixtures, runners or configuration. Run applicable resolved core/browser/native Nx gates after implementation. Native host integration and real Worker interruption need their existing runtime seams; this source review ran none and makes no pass claim.
4. Reconcile database/native/session READMEs and workflow citations after implementation. Reconcile the existing glossary; an ADR is only warranted if the actual observation/replication ownership trade-off meets all repository criteria. Archive after required verification completes.

## Implementation progress — 2026-10-11

1. Real WASM inline probe passed array/object rows, root/savepoint commit and rollback, copied byte parameters, committed-SQL-before-table ordering, observer isolation and reentrant commits. Native statement SQL metadata is wired through the TypeScript/Swift host. No new test files, fixtures, runners, or configuration were created.

### Integration update — 2026-10-11

WASM, native host and Drizzle execution share one statement preparation/binding/stepping/finalization owner. Commit observation owns normalized write tables and nested transaction frames; reentrant observers are isolated after committed statement/transaction completion. Actual WASM probes passed row modes, nested rollback, byte ownership, reentrant writes, original change counts and observer isolation.

### Additional bounded runtime evidence — 2026-10-11

An inline check against the real WASM client and existing TicTacToe `game` Table passed the supported restored-name notification boundary (`/tmp/zerospin-goal-110-115-extra-inline.log`). Explicit restored names produce one settled batch whose listener can read committed rows; an active transaction delays that notification until commit; an empty restored set and a detached listener produce no notification. Current exhaustive source/caller searches locate this boundary in `ISqliteClient`, `makeInMemorySQLite3`, and `openNativeSqlite`, with ordinary commit observation calling it without restored names. There is no current binary backup/restore API or caller; this evidence does not claim native restoration or host ordering. No new files, fixtures, runners, configuration or production changes were required.

### Native restored-name settlement correction — 2026-10-11

Source inspection found a concrete native observer defect: Swift returned the same empty array for an active transaction and a settled connection with no changed tables, so the TypeScript adapter merged caller-supplied restored names and could notify listeners before commit. The private Swift bridge now returns `null` while SQLite autocommit is disabled. The native adapter decodes array-or-null and returns on `null` without clearing queued restored names; a settled empty array still permits those names to publish. Reentrant notification ownership, observer isolation and the `finally` release of the flush guard remain intact. No new tests, fixtures, runners, configuration or bridge compatibility path were added.

Fresh serial checks after this correction pass: native build/TypeScript/lint and eight dependency tasks (`/tmp/zerospin-goal-native-110-restored-gates.log`), the actual Swift compiler (`/tmp/zerospin-goal-swift-110-restored-build.log`), and the actual Xcode iOS build (`/tmp/zerospin-goal-ios-110-restored-build.log`). Actual native notification ordering, including restored names supplied during an active transaction, remains an unrun required host check; the existing WASM proof does not substitute for it.

The latest existing TicTacToe app also passed cold startup and one unchanged-installation warm reopen on an owned simulator after the bridge correction. Actual SQLite files provision and reopen through the native adapter; readonly logical metadata, actor origin, Node/Session identity, cursor/hash and empty resource/command counts are unchanged across reopen. Both connections reach backend WebSocket101 without host errors (`/tmp/zerospin-goal-native-110-smoke-backend.log`, `/tmp/zerospin-goal-native-110-smoke-reopen-data.json`). The ordinary app does not supply restored names, so this host baseline does not establish the controlled restored-name notification case.

### Final source gates — 2026-10-11

The final fourteen-project library, TypeScript and lint graph passes with no source warnings (`/tmp/zerospin-goal-quality-8.log`). Native, Shopping and TicTacToe build/type/lint pass (`/tmp/zerospin-goal-consumers-5.log`); Explorer build/actual typecheck/lint pass with six pre-existing UI warnings (`/tmp/zerospin-goal-explorer-2.log`). Core's actual `tsc:typecheck` passes with `--skipSync` for existing project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS app builds pass (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Nx Cloud code401 does not prevent local verification. Runtime evidence and any remaining criteria are recorded separately.

### Actual native command journals — 2026-10-11

The actual existing native app now commits and reopens nonempty Node/Session storage through the Swift/JavaScriptCore/SQLite host. Ordinary gameplay settles one game at public6/private4, including a durably staged offline original preserved through actual process restart and automatic backend recovery; a second independently retained game settles at public3/private2. Readonly comparisons include WAL-backed rows, retained originals/finals, resource projections and file identities (`/tmp/zerospin-goal-native-retry-journal.log`, `/tmp/zerospin-goal-mounted-native-retry-fixed-offline-recovery-journal.log`, `/tmp/zerospin-goal-mounted-native-second-game-journal.log`). Fresh native build/TypeScript/lint and actual iOS compilation pass after the shared handoff and connection recovery corrections recorded in [114](114-plan-native-persistent-owner.md).

These normal host transactions and process persistence do not supply explicit restored table names, hold an observer inside a transaction, or interrupt accepted SQL during close. Those controlled native ordering and fencing checks remain required.

### Authorized actual Swift/SQLite observer verification — 2026-10-11

The disposable fixture `/tmp/zerospin-framework-goal-data-core-UAv4C2/native-host-fixture` compiles the actual Swift `SQLiteHost`, `JavaScriptExecutor` and `Session` sources, loads the existing host resource bundle, and executes production `openNativeSqlite`, `makeSqliteDrizzle` and provisioning through JavaScriptCore. Its invocation exited0; `/tmp/zerospin-framework-goal-data-core-UAv4C2/native-host.log` records `PASS110`.

A root transaction inserted two retained rows with an intervening rolled-back savepoint. Explicit `restoredRows` names supplied while the transaction was active produced no intermediate notification. After commit the SQL observer ran first, with only the two committed statements; the table observer then received both committed and restored names and read exactly rows1/3. Both a throwing committed-SQL observer and a throwing table observer were isolated: the transaction still returned `committed`, and a later observer read settled rows. A separate root rollback left the complete persisted rowset unchanged. Closing the actual executor and reopening that same native directory read the retained rows1/3, with no compatibility or restoration decoder. These are actual macOS Swift/JavaScriptCore/SQLite host checks with a controlled temporary JavaScript app dependency; they do not claim iOS scheduling or Worker interruption.

### Authorized actual SharedWorker SQLite/VFS drainage — 2026-10-11

`/tmp/zerospin-framework-goal-data-core-UAv4C2/browser-drain-2.log` records an isolated headless Chromium run of the production AggregateNode, SharedWorker connection/runtime owners, IndexedDB-backed SQLite VFS and Web Locks. A real admitted metadata SELECT was held before statement execution. Worker shutdown revoked port capabilities and locally retired the caller; SQL and storage close remained pending until that admitted statement was released. A separately held real storage close kept the namespace lease exclusive. The observed order was `sql-released → storage-close-entered → storage-closed → owner-closed`; a cancelled lease waiter never entered, and a new owner acquired only after actual SQLite/VFS close.

The new owner reopened the exact full schema, user version, retained original/final journal, metadata, resources and generated Node ID. The fixture and its isolated Chrome process joined with exit0. A naked saved RPC after peer-port close was opaque until the actual local connection disposed; no immediate peer-close notification is claimed. Combined with the real native commit/rollback/observer and WASM cases above, this completes the required connected-host SQL drain and close fencing. No user browser profile, original native storage or simulator was changed.

## Remaining work

None.
