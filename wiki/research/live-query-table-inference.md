# Automatic live-query table inference

**Date:** 2026-10-15  
**Status:** Implemented and verified, including the explicitly approved native session-wiring repair. See [Plan 185](../archive/plans/185-plan-live-query-table-inference.md).
**Scope:** Current local Zerospin source, installed Drizzle `1.0.0-rc.4`, installed `@livestore/wa-sqlite` `1.0.5`, and first-party SQLite/LiveStore/PowerSync sources. Inline probes used temporary in-memory databases and created no test or runner files.

## Implemented design

Read dependencies are collected inside the SQLite adapter using `sqlite3_set_authorizer` and `SQLITE_READ`, then intersected with committed-table notifications. The caller-supplied `tableNames` contract has been removed. The unchanged checkout query watches the physical tables `cart`, `cartItem`, and `purchase`.

The browser engine exposes the callback directly. The native host collects the same information in Swift and returns it through the synchronous bridge. SQLite resolves dependency identities, including those hidden inside raw SQL. [Browser adapter](../../packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts), [native bridge](../../packages/native/src/openNativeSqlite.ts), [native host](../../packages/swift/Sources/Zerospin/SQLiteHost.swift), [SQLite authorizer](https://www.sqlite.org/c3ref/set_authorizer.html).

The filter provides **table dependency invalidation**: rerun when a committed-table notification names a referenced table. Notifications containing only unrelated tables are ignored. An update to an unrelated row in a referenced table can still cause a rerun. Avoiding that would require row/range dependency tracking or incremental query maintenance.

## Superseded broad invalidation

Previously, `useLiveQueryOnDb` forwarded an optional caller list to `makeLiveQuery`; an empty set meant every nonempty committed-table notification. Query execution now owns its inferred dependencies. The update/commit hooks still report changed tables after settlement, while read tracking supplies the other side of the intersection. [React hook](../../packages/react/src/useLiveQueryOnDb.ts), [query store](../../packages/live-query/src/makeLiveQuery.ts), [commit hooks](../../packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts).

The query's TypeScript return type describes its result, not its complete SQL dependencies. Restricting the returned columns or relation graph does not itself configure invalidation.

Both adapters now retain changed-table snapshots for named savepoints. Successful rollback restores the matching snapshot and discards nested frames; release retains writes. Uncommitted names are separate from undelivered committed names, so a later transaction rollback cannot erase an earlier notification. This supersedes the conservative savepoint invalidation retained by [Plan 110](../archive/plans/110-plan-sqlite-execution-and-commit-observation.md).

## Drizzle metadata is insufficient

The installed relational-query implementation does not pass table metadata into `prepareQuery`. Select-builder metadata tracks direct `FROM`/`JOIN` tables, while nested SQL dependencies can disappear. Drizzle's immediate SQL-chunk `usedTables` information is not a complete recursive dependency graph. Its Expo live-query integration identifies the root query entity, which is insufficient for this checkout relation query. These are observations of the installed version, not claims about every future Drizzle release. [Relational implementation](../../packages/core/node_modules/drizzle-orm/sqlite-core/async/query.js), [select builder](../../packages/core/node_modules/drizzle-orm/sqlite-core/query-builders/select.js), [SQL chunks](../../packages/core/node_modules/drizzle-orm/sql/sql.js), [Expo integration](../../packages/core/node_modules/drizzle-orm/expo-sqlite/query.js).

Inline probes against those installed classes produced:

| Query shape | SQL dependency set | Available Drizzle metadata |
| --- | --- | --- |
| Relational cart with items and checkout purchase | `cart`, `cartItem`, `purchase` | `getUsedTables` absent; SQL `usedTables` empty |
| Direct join | Both joined tables | Both tables |
| `WHERE … IN (SELECT …)` | Outer and nested tables | Outer table only |
| CTE | Underlying table | Empty |
| `UNION` | Tables from both arms | First arm only |
| Raw SQL `FROM` | Referenced table | Empty |

Reading a private Drizzle field or walking only the root relational table would therefore miss changes and leave stale results. The database compiler already resolves the SQL that actually reaches the connection.

## What SQLite provides

The authorizer runs during statement compilation. `SQLITE_READ` supplies a table and column; database and enclosing view/trigger information are separate arguments. It also reports `COUNT(*)` table access with an empty column. Return `SQLITE_OK` so observation does not change authorization. SQLite permits one authorizer per connection; its callback must not reenter/modify that connection. A statement can recompile during `step` after a schema change, so the callback must remain installed while stepping. [Authorizer behavior](https://www.sqlite.org/c3ref/set_authorizer.html), [action arguments](https://www.sqlite.org/c3ref/c_alter_table.html).

The installed `@livestore/wa-sqlite` implements `set_authorizer` in `src/sqlite-api.js` and declares it in `src/types/index.d.ts`. This synchronous path uses a synchronous collector. Read observation adds names and returns `SQLITE_OK`; ordinary DELETE observation returns `SQLITE_IGNORE` to disable truncation so the update hook sees deleted rows. Schema deletion retains `SQLITE_OK`.

### Verified browser behavior

Inline probes loaded the installed synchronous WASM build, which reports SQLite `3.47.0`. Queries ran against fresh in-memory tables. Read notifications occurred during preparation even when the query returned no rows.

| Query shape | Observed read dependencies |
| --- | --- |
| Checkout-shaped parent plus nested relation subqueries, empty database | `cart`, `cartItem`, `purchase` |
| Ordinary select with no matching row | Referenced table |
| `COUNT(*)` / `EXISTS` | Referenced table, including an empty column name |
| Join | Both physical tables |
| Nested select | Outer and nested tables |
| CTE | Underlying physical table |
| SQL view | Base tables and the view name |
| `SELECT 1` | Empty set |
| Referenced table behind `WHERE 0` | Referenced table still reported |

Two details matter:

- The installed wrapper converts missing callback strings to `''`. In the observed `COUNT(*)` notification, the table was present while the database name was empty. Filtering only `schema === 'main'` would lose that dependency. Current clients use one main database and bare table names for change notifications; preserve the table name even when the optional database field is empty.
- These are compiler dependencies, not a trace of rows physically visited on that run. `WHERE 0` still reports its table, and views report their base tables. This conservative table set is suitable for invalidation and covers future inserts into currently empty results.

These initial research probes established read discovery. Production integration and native runtime evidence are recorded below.

## Integration

Keep responsibilities at the existing boundaries:

1. **SQLite adapters collect read tables.** Install one permanent authorizer per connection. Scope collection to the statement/query being inspected, restore prior collection state in `finally`, and keep collection active through compilation and stepping. The callback performs no queries and invokes no observers.
2. **The shared driver exposes the collected information.** Extend the common `ISqliteClient` contract rather than exposing WASM-specific callback details to React. On native, collect in `SQLiteHost.swift` and return the names through the synchronous bridge; a JavaScript callback crossing into C is unnecessary. [Client contract](../../packages/core/src/drizzle/types.ts), [native bridge](../../packages/native/src/openNativeSqlite.ts).
3. **Live-query execution owns its dependency set.** The built synchronous query captures its read statements and replaces its dependencies after success. A successful empty set means no database tables and never means “watch everything.” Initial read and subscribe-time catch-up retain their existing lifecycle.
4. **Committed changes use set intersection.** Preserve the existing commit/rollback notification boundary and serialized reentrant rerun handling. Rerun when a changed-table set intersects the successful read set. Replace that set after a subsequent successful read; a changed query key already constructs a new lifecycle. [Query store](../../packages/live-query/src/makeLiveQuery.ts).
5. **Remove the manual API and stabilization state.** Delete `tableNames` plumbing, validation, normalization and memoization across public hooks, direct query-store callers, and relevant documentation. Keep one inference path under the repository's pre-release cutover policy. [React hook](../../packages/react/src/useLiveQueryOnDb.ts).

### Sequencing and ownership requirements

- **Do not collect other observers' reads.** `executeStatementRows` calls `finishExecution` in `finally`; that path can flush committed-table listeners, which may execute other live queries. End/suspend attribution for the originating read before listener delivery, then let a nested query own its own collection. A single ambient set wrapped blindly around `.sync()` can accumulate unrelated observers' tables. [Statement execution](../../packages/core/src/drizzle/executeStatementRows.ts), [commit observation](../../packages/core/src/drizzle/makeCommitObservation.ts).
- **Retain the existing failure distinction.** Core session queries terminate on committed read failures. Lower-level diagnostic queries may retain data and recover; those must retain the last successful dependency set when a later read fails. A failed/unknown discovery must never be published as a known empty set. [Query failure handling](../../packages/live-query/src/makeLiveQuery.ts).
- **Do not add statement-cache machinery now.** Drizzle's `.prepare()` retains the driver closure here; `executeStatementRows` prepares and finalizes native statements on every execution. If a native statement cache is introduced later, retain its discovered dependencies on cache hits and refresh them on reprepare. [Session preparation](../../packages/core/src/drizzle/SqliteSession.ts), [execution loop](../../packages/core/src/drizzle/executeStatementRows.ts).
- **Keep connection ownership explicit.** Installing another authorizer would overwrite this one. Future security authorization must be composed by the same adapter owner, not installed independently by each hook. [Single-authorizer rule](https://www.sqlite.org/c3ref/set_authorizer.html).
- **Use the existing table identity consistently.** Bare physical names match the present single-database change stream. Adding attached databases would require qualifying both read and write identities together. SQL functions with hidden external state do not acquire database reactivity from table discovery alone.

## Alternatives and first-party precedents

| Approach | Evidence | Assessment for Zerospin |
| --- | --- | --- |
| SQLite authorizer | Stable C API; installed browser API and inline probes confirmed | Recommended; observes the normal compiler path and works across browser/native without a new SQL parser |
| `tables_used(sql)` | SQLite extension; current LiveStore uses it | Credible alternative, available in the installed WASM build; native availability must be established |
| `EXPLAIN` opcode inspection | Current PowerSync implementation | Works for PowerSync's supported engine assumptions; adds bytecode and schema-mapping coupling |
| Parse `EXPLAIN QUERY PLAN` descriptions | SQLite documents the output as debugging-only | Avoid; applications are explicitly warned not to depend on that output format |
| Traverse Drizzle objects or SQL text | Installed metadata probes above | Incomplete without rebuilding SQLite's resolution rules for nested queries, views, aliases and raw SQL |

SQLite's `tables_used` reports persistent table/index btrees and distinguishes read/write access. It requires `SQLITE_ENABLE_BYTECODE_VTAB`. The installed WASM build returned `1` for `sqlite_compileoption_used('ENABLE_BYTECODE_VTAB')`, and `tables_used('SELECT 1')` executed successfully. [SQLite extension documentation](https://www.sqlite.org/bytecodevtab.html).

LiveStore resolves those btree names through `sqlite_master.tbl_name` so covering-index access maps back to its owning table. It caches the results by SQL. This proves automatic dependency discovery is a production design used by a closely related SQLite stack; it does not require adopting LiveStore's cache or query runtime. [Pinned LiveStore implementation](https://github.com/livestorejs/livestore/blob/94f89d1c97bc8c4c55c0affeaa5568de559bfbcb/packages/%40livestore/livestore/src/SqliteDbWrapper.ts#L125).

PowerSync's actual `resolveTables` implementation executes `EXPLAIN`, extracts `OpenRead` root pages for its main database, and maps them through `sqlite_master.tbl_name`. Its API comments mention `EXPLAIN QUERY PLAN`, but the implementation uses bytecode. SQLite documents bytecode as an internal interface that changes between releases, and separately warns against depending on query-plan output formatting. [Pinned PowerSync implementation](https://github.com/powersync-ja/powersync-js/blob/198a3d24dfc9a5eff3d038fd9fe2e4027eb2891a/packages/shared-internals/src/client/BasePowerSyncDatabase.ts#L778), [bytecode stability](https://www.sqlite.org/opcode.html), [query-plan stability](https://www.sqlite.org/eqp.html).

## Implementation verification

Existing verification files and inline/stdin probes were used; no test, fixture, runner or configuration files were created.

- Checkout's unchanged relational query discovers all three physical tables even before any matching cart exists.
- The unchanged query with actual Shopping models and production Drizzle/live-query code discovers all three dependencies before any cart exists. Cart, item and purchase commits rerun it; unrelated commits and raw/Drizzle savepoint rollbacks do not.
- Successful zero-table queries do not rerun on table changes; joins/nested queries and views retain underlying dependencies.
- Error recovery retains prior dependencies where recovery exists, and reentrant listeners do not contaminate another query's set.
- Actual Swift compilation and Swift/JavaScriptCore/native-adapter integration passed, including read attribution, rollback snapshots and preservation of prior committed names. A strict typecheck of the changed native adapter passed.
- The existing contract runner passed all eight runtime groups. Scoped Nx library/build/lint checks and browser/React/DevTools/Studio type checks passed. The explicitly approved native wiring repair then passed the full native build/type/lint graph; the existing session identity/recovery runner passed all six groups. The archived plan records the final evidence.

Final review also verified whole-table DELETE notifications and isolated schema-DROP classification during automatic repreparation. The browser API eagerly prepares batches, so mixed schema/DML batches are recompiled per statement to keep DROP's internal deletions distinct from ordinary DELETE truncation. Normal single-statement live reads use their existing preparation path.
