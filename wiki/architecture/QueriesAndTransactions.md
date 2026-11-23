---
title: Queries, transactions and fixed persistence
updated: 2026-10-26
sources:
  - path: packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts
    sha: 42ac9e044a23e85ee828c2ab3fef5f6a8d9a69e1
    lines: 12-37
  - path: packages/core/src/drizzle/provisionDb/provisionDbTx/provisionDbTx.ts
    sha: 5f4e1d7bfaabfbc8b9b66042d641f1bf09ae0af3
    lines: 5-11
  - path: packages/core/src/drizzle/make/makeTx.ts
    sha: e587cc6e1387c2aee746b7cdf84ed6a3ffa3f1c3
    lines: 16-125
  - path: packages/core/src/drizzle/SqliteSession.ts
    sha: 88f5a0e76390ee2fcccea93ea561a8c8ebaad369
    lines: 107-133
  - path: packages/shapes/src/runSynchronousExit.ts
    sha: 8ab8a309fd7e8999259ec739d335e0fdc48e185f
    lines: 1-75
  - path: packages/core/src/drizzle/makeCommitObservation.ts
    sha: 0ce43f5d8737045b284d3c17e1c5dc242540c890
    lines: 8-29
  - path: packages/core/src/Node/resourceEnvelope.ts
    sha: f30906bee6b16d5dffd4f030092e7943082454a6
    lines: 13-63
  - path: packages/core/src/models/encodeRowAsResource.ts
    sha: 41e9c5ab18595554a190007626ab88905a60dc5d
    lines: 7-54
  - path: packages/shapes/src/makeEncodedShapeRowCodec.ts
    sha: 5f46def13a0479e652f54563292e6037ed4f6105
    lines: 1-66
  - path: packages/core/src/models/ResourceEnvelopeJsonCodec.ts
    sha: b7f7429bc088b518f90135df306bf425dfc87a8f
    lines: 1-19
  - path: packages/core/src/drizzle/SqliteRelationalQueryBuilder.ts
    sha: 3b19a4d6030f0fc6be282ade83e613e156d56d70
    lines: 24-54
  - path: packages/core/src/drizzle/make/makeSqliteDrizzle.ts
    sha: 35a77d297a1f6c6a444fad82dafae12ac164fe2d
    lines: 38-69
  - path: packages/core/src/contracts/make/makeContractReadDb.ts
    sha: e62ff0a0685c970f6051f0899a844f69abcf8564
    lines: 280-304
  - path: packages/react/src/useLiveQuery.ts
    sha: 07db8c17381ee5bebd67352063c135c2adc82322
    lines: 77-118
  - path: packages/core/src/drizzle/withSavepoint.ts
    sha: 75ea18258cd6abcae349f1aadb9deb936d5de94a
    lines: 35-80
  - path: packages/core/src/drizzle/fenceTransaction.ts
    sha: 43678946db9da2397aae48f18e962820238b3d01
    lines: 24-70
  - path: packages/core/src/sessionExecution/replayOptimisticCommandTx.ts
    sha: 28318d528a1a6e8fd645c7cc13d148927f9c251f
    lines: 59-77
  - path: packages/core/src/drizzle/executeStatementRows.ts
    sha: 000a6b1666d59da144cea16636b9ed2cd87f17e9
    lines: 14-79
  - path: packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts
    sha: 879d97c7a03672b6d6bf04e4be3f40230ae0e655
    lines: 55-245
  - path: packages/core/src/drizzle/definition/bindDatabaseDefinition.ts
    sha: 1823f20ab3aebe740e242d3e62d79acfa58927fa
    lines: 1-90
  - path: packages/core/src/drizzle/definition/compileSqliteTableDefinition.ts
    sha: 0338d6b9a6362c4df639ca9a446c6cdd46484abf
    lines: 1-79
  - path: packages/core/src/drizzle/provisionDb/provisionDbTables.ts
    sha: 8610c04dab104682d92e417fedc3a705f9da4254
    lines: 15-47
  - path: packages/core/src/models/captureSelectionDefinition.ts
    sha: e921f888e3b48d4674166754ffd5c998259438b6
    lines: 24-93
  - path: packages/core/src/models/make/makeQueryDbVersion.ts
    sha: 4e39ced36bbbe8e364c15f4a81f7680ba8483857
    lines: 207-326
---

# Queries, transactions and fixed persistence

Application queries return stored model rows. Runtime adapters own encoding, statement execution, synchronous transaction lifetime, fixed physical schema and committed-table observation. This page connects those boundaries; [Query data](../../docs/content/guides/query-data.md) owns public usage.

## Trigger

1. Bind authored tables with `makeDbConfig` or model tables with `makeResourceDbConfig` before opening a runtime database.
   - [`makeDbConfig.ts:12-37`](../../packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts#L12-L37) — validates/composes tables and renders immutable persistence, relational and provisioning definitions once.
2. Provision the bound fixed definition before exposing queries or running a transaction.
   - [`provisionDbTx.ts:5-11`](../../packages/core/src/drizzle/provisionDb/provisionDbTx/provisionDbTx.ts#L5-L11) — runs provisioning in one synchronous `makeTx` program.

```mermaid
sequenceDiagram
    participant Invocation
    participant makeTx
    participant SqliteSession
    participant runSynchronousExit
    participant TransactionProgram
    participant makeCommitObservation
    Invocation->>makeTx: program(...)
    makeTx->>SqliteSession: db.transaction(...)
    SqliteSession->>SqliteSession: session.run(...)
    makeTx->>runSynchronousExit: runSynchronousExit(...)
    runSynchronousExit->>TransactionProgram: program(...)
    TransactionProgram-->>runSynchronousExit: Exit
    runSynchronousExit-->>makeTx: completed Exit
    SqliteSession->>SqliteSession: session.run(...)
    SqliteSession->>makeCommitObservation: observation.finishTransaction()
    makeTx-->>Invocation: committed value or complete failure Cause
```

## Annotated workflow steps

1. Execute a named transaction program against its explicit database.
   - [`makeTx.ts:16-54`](../../packages/core/src/drizzle/make/makeTx.ts#L16-L54) — binds the program, definition source and database while preserving inferred requirements/errors.
2. Enter the native synchronous transaction; nested `makeTx` invocation is refused.
   - [`makeTx.ts:65-79`](../../packages/core/src/drizzle/make/makeTx.ts#L65-L79) — captures the context and fences the native transaction handle before evaluation.
3. Begin SQLite before evaluating the callback.
   - [`SqliteSession.ts:107-120`](../../packages/core/src/drizzle/SqliteSession.ts#L107-L120) — creates the transaction handle and executes BEGIN before the callback.
4. Run the Effect to synchronous completion with the transaction close fence.
   - [`makeTx.ts:74-94`](../../packages/core/src/drizzle/make/makeTx.ts#L74-L94) — supplies the complete execution context, captures rollback-only/failure exits and closes the transaction handle.
5. Evaluate the transaction program and cancel suspended work before returning control to SQL.
   - [`runSynchronousExit.ts:1-75`](../../packages/shapes/src/runSynchronousExit.ts#L1-L75) — captures the Exit, fences on suspension, interrupts and flushes the suspended fiber while preserving independent cleanup reasons.
6. Return the complete synchronous Exit to the transaction owner.
   - [`makeTx.ts:80-89`](../../packages/core/src/drizzle/make/makeTx.ts#L80-L89) — retains failure or always-rollback success before raising its private rollback sentinel.
7. Fence transaction-owned builders before the native callback exits.
   - [`makeTx.ts:90-95`](../../packages/core/src/drizzle/make/makeTx.ts#L90-L95) — closes the handle in `finally` before any committed observer can start new work.
8. Commit successful work or roll back the captured refusal/defect.
   - [`SqliteSession.ts:122-129`](../../packages/core/src/drizzle/SqliteSession.ts#L122-L129) — commits after callback completion and rolls back thrown failures.
9. Publish committed table changes after statement and outer transaction completion.
   - [`SqliteSession.ts:130-133`](../../packages/core/src/drizzle/SqliteSession.ts#L130-L133) — settles transaction observation after COMMIT or ROLLBACK.
   - [`makeCommitObservation.ts:8-29`](../../packages/core/src/drizzle/makeCommitObservation.ts#L8-L29) — waits for zero transaction/execution depth and isolates observer failure.
10. Return a value after successful commitment or propagate every captured execution reason after rollback.
    - [`makeTx.ts:97-125`](../../packages/core/src/drizzle/make/makeTx.ts#L97-L125) — recognizes only its exact rollback sentinel, records SQL failure with captured execution Cause, or returns/fails from the complete Exit.

## Rows, resources and JSON boundaries

A model SQL row contains authored attributes plus `id`, `createdAt` and `updatedAt`. Bound `modelName` and `version` are envelope identity, never SQL/query/index columns. Complete incoming resources are validated before those constants are removed. Export reconstructs both from the same model binding. JSON-text attributes and native Dates remain encoded persistence values; JSON serialization of a complete message is a separate schema boundary.

- [`resourceEnvelope.ts:13-63`](../../packages/core/src/Node/resourceEnvelope.ts#L13-L63) — validates full identity/attributes, removes envelope constants for storage, and reconstructs complete outgoing resources while preserving encoded JSON attributes.
- [`encodeRowAsResource.ts:7-54`](../../packages/core/src/models/encodeRowAsResource.ts#L7-L54) — validates a decoded row under bound model identity and encodes authored properties.

`table.encodeRow`/`decodeRow` convert full table rows, retaining Date values while encoding/decoding declared JSON columns. `model.resourceJsonCodec` converts complete decoded resources to JSON-compatible objects, including declared Date fields. `ResourceEnvelopeJsonCodec` only declares the framework envelope timestamps; the model-specific properties codec validates authored Date attributes. `Schema.fromJsonString(MessageSchema)` owns an entire JSON message string.

- [`makeEncodedShapeRowCodec.ts:1-66`](../../packages/shapes/src/makeEncodedShapeRowCodec.ts#L1-L66) — derives each encoded property codec from the complete authored shape.
- [`ResourceEnvelopeJsonCodec.ts:1-19`](../../packages/core/src/models/ResourceEnvelopeJsonCodec.ts#L1-L19) — declares the generic resource envelope and framework timestamp conversion.

Persistence `config.schema`/`model.drizzleSchema` accepts encoded SQLite values. Relational `db.query`/`tx.query` uses separately rendered decoded JSON fields, including internal registered tables. Predicates encode decoded JSON values before binding; selected columns/relations retain their inferred decoded values and invalid selected JSON fails. Raw SQL expressions require their explicit mapping. `findFirstOrThrow` shares filters/columns/relations with `findFirst` but rejects an absent row in synchronous, awaited and prepared execution.

- [`makeDbConfig.ts:12-18`](../../packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts#L12-L18) — renders persistence and decoded query schemas separately from one bound graph.
- [`SqliteRelationalQueryBuilder.ts:24-54`](../../packages/core/src/drizzle/SqliteRelationalQueryBuilder.ts#L24-L54) — checks required-row presence in the shared prepared mapper.
- [`makeSqliteDrizzle.ts:38-69`](../../packages/core/src/drizzle/make/makeSqliteDrizzle.ts#L38-L69) — installs durable SQLite codecs and relational definitions on the connection.

Inside `makeTx`, `tx.query` sees preceding writes in the same transaction. Contract/guard query capabilities expose reads; constructing a recorded operation does not mutate subsequent query results. Parallel model writes remain command execution/replay responsibility. `useLiveQuery` receives model-only reads; it cannot mutate or read internal command tables through that callback.

- [`makeContractReadDb.ts:280-304`](../../packages/core/src/contracts/make/makeContractReadDb.ts#L280-L304) — binds declared model query capabilities to the invocation's database.
- [`useLiveQuery.ts:77-118`](../../packages/react/src/useLiveQuery.ts#L77-L118) — binds the session's current initialized query database and selected model read surface.

## Savepoints, cancellation and error ownership

`withSavepoint` uses the same synchronous Exit/fence discipline inside an existing transaction. Domain policies recognize a single expected refusal only after rollback; composite Causes, cleanup defects and independent interruptions remain intact. The runner filters only interruption it induced itself. SQL begin/savepoint/commit/release/rollback failure belongs to the owning transaction error. A rollback failure remains primary and records the original execution Cause in diagnostics.

- [`withSavepoint.ts:35-80`](../../packages/core/src/drizzle/withSavepoint.ts#L35-L80) — fences suspended execution, retains the full Exit across successful rollback and reports SQL failure separately.
- [`fenceTransaction.ts:24-70`](../../packages/core/src/drizzle/fenceTransaction.ts#L24-L70) — wraps transaction methods and prebuilt query builders, rejecting use after close.
- [`replayOptimisticCommandTx.ts:59-79`](../../packages/core/src/sessionExecution/replayOptimisticCommandTx.ts#L59-L77) — returns null only for a sole recognized refusal after savepoint completion; other reasons propagate.

An already uninterruptible asynchronous release can finish later, but the fenced handle cannot issue SQL after commit or rollback. Returned data and the parent database retain their normal lifetimes.

## Statements and committed-table observation

One statement engine normalizes supported parameters, copies byte buffers, prepares/binds statements, collects array/object rows and finalizes before publication. It captures SQLite `changes` before observers can reenter. Query metadata remains available to Drizzle prepared queries.

- [`executeStatementRows.ts:14-79`](../../packages/core/src/drizzle/executeStatementRows.ts#L14-L79) — normalizes parameters and brackets prepared statement execution/finalization with observation depth.

SQLite authorizer `SQLITE_READ` callbacks record physical dependencies during preparation and automatic repreparation, including joins, subqueries, views and empty results. A query with no table reads watches no tables. Update/commit hooks record names and commit state; they do not run queries or publish SQL statements. Savepoint rollback restores earlier pending change sets and drops later ones. Isolated observers run after stepping/finalization and settled outer SQL; reentrant observer writes form later batches. Restore callers publish restored table names only after the live connection is ready.

- [`makeInMemorySQLite3.ts:55-86`](../../packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts#L55-L86) — tracks read tables, savepoints and committed write sets in the browser-compatible adapter.
- [`makeInMemorySQLite3.ts:184-245`](../../packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts#L184-L245) — records update/commit hooks and flushes isolated observer batches after autocommit resumes.

## Fixed schema and declarative selections

The bound graph validates table identity, physical names, sole primary keys, relation names/cycles and index names/columns before runtime opening. Provisioning quotes identifiers, retains foreign-key actions and supports declared single-column null/not-null partial indexes. Existing column/key/unique/foreign-key/index metadata must match; missing tables/indexes are provisioned atomically. A mismatch requires empty storage. Provisioning neither migrates nor erases existing rows, and this documentation migration authorizes no storage reset.

- [`bindDatabaseDefinition.ts:1-90`](../../packages/core/src/drizzle/definition/bindDatabaseDefinition.ts#L1-L90) — validates and freezes the authored database graph.
- [`compileSqliteTableDefinition.ts:1-79`](../../packages/core/src/drizzle/definition/compileSqliteTableDefinition.ts#L1-L79) — derives named table/index provisioning from raw Drizzle metadata.
- [`provisionDbTables.ts:15-47`](../../packages/core/src/drizzle/provisionDb/provisionDbTables.ts#L15-L47) — validates existing fixed tables before creating missing indexes and reports a storage-reset-required mismatch.

Selections retain authored options, identity references and explicit SQL expression structure separately from compiled SQL/positional bindings. Compiler changes can change executable SQL while the accepted definition remains equal; changing a filter, identity reference, ordering, limit or authored SQL fragment changes the declaration. RAW/order callbacks must be pure; capture retains the returned expression rather than JavaScript source. Unsupported executable values, cycles, undeclared identity placeholders and noncanonical models are refused.

- [`captureSelectionDefinition.ts:24-93`](../../packages/core/src/models/captureSelectionDefinition.ts#L24-L93) — captures serializable authored options and canonical table/column/identity references while rejecting unsupported cycles/values.
- [`makeQueryDbVersion.ts:207-326`](../../packages/core/src/models/make/makeQueryDbVersion.ts#L207-L326) — captures authored selection identity and separately freezes compiled SQL and bindings.

The pinned upstream Drizzle release and its `durable-sqlite/codecs` define the executable SQLite compilation and row mapping. Drizzle compiles nested to-one relation filters into a correlated `EXISTS` for each hop. Plan 236 retains its own runtime verification requirements.
