# `makeTx` transaction options and commit observation

**Date:** 2026-10-28.  
**Status:** Historical source research; the settled decision below supersedes its journal-ordering proposal. No storage changes were made by this research.  
**Inspected revision:** `27074a62a0a38b1b75b7df81c4a22a6defb36a85` (Zerospin 37.0.1 preparation), plus installed `@zerospin/drizzle-orm@1.0.0-rc.5-qrk.3`.

## Settled decision (2026-10-28)

The approved implementation removes the transaction options bag and the adapter
commit hook. `makeTx(name)(program)(db, ...args)` owns synchronous atomic SQL and
preserves failure causes. Direct `rehearse(db, tx => effect)` always rolls back,
returns `void` on success, and propagates failures; it does not return a captured
successful program value.

The historical claim that recovery requires journaling before table observers is
superseded. Staging commits its SQL first. Committed-table observers may run before
the transaction returns. The staging owner then attempts its captured journal
callback outside the transaction and contains callback errors. SQL and journal
storage are independent; a best-effort journal failure cannot reverse an already
committed staging result. Entry readiness checks remain, without reclassifying
successful staging after a later observer withdraws readiness.

Aggregate and Service telemetry collectors buffer records synchronously and
coalesce store publication into a microtask. `flushOwn()` and `flush()` drain their
buffers synchronously; queued publication reads the latest buffer. This changes
telemetry delivery only, not lifecycle or other store subscriptions.

- [`makeTx.ts:19-178`](../../packages/core/src/drizzle/make/makeTx.ts#L19-L178) owns the transaction program and direct, void-returning rehearsal.
- [`stageSessionCommandTx.ts:106-115`](../../packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommandTx/stageAggregateSessionCommandTx.ts#L106-L115) attempts the Aggregate callback after transaction success and catches exceptions.
- [`stageServiceSessionCommandTx.ts:92-99`](../../packages/core/src/serviceSession/stageServiceSessionCommandTx.ts#L92-L99) preserves committed Service staging across journal callback failure.
- [`SqliteSession.ts:122-132`](../../packages/core/src/drizzle/SqliteSession.ts#L122-L132) settles SQL before observer publication.
- [`makeServiceReplicaValidator.ts:45-69`](../../packages/browser/src/sessionReplica/makeServiceReplicaValidator.ts#L45-L69) invokes direct rehearsal after checking the current replica and exact contract.
- [`makeAggregateSession.ts:38-90`](../../packages/core/src/aggregateSession/make/makeAggregateSession.ts#L38-L90), [`makeServiceSession.ts:46-98`](../../packages/core/src/serviceSession/make/makeServiceSession.ts#L46-L98) own buffered synchronous collection and deferred store publication.

The sections below retain the earlier source investigation at its pinned revision,
including proposals and test assertions that this decision replaces. They do not
claim verification of the new implementation.

## Historical direct answer

The hardcoded `behavior: "deferred"` buys no demonstrated requirement. SQLite already uses deferred transactions for plain `BEGIN`; Cloudflare Durable Objects provide their own synchronous transaction primitive and reject that driver option. `onCommit` serves a real browser ordering requirement, but its current presentation as a generic transaction option is misleading: it is a Zerospin-only extension consumed by exactly one SQLite adapter. `rollback: "always"` serves a separate rehearsal requirement. These three concerns should not be treated as one coherent driver configuration. Sources and qualifications follow below.

## What the options actually mean

### `behavior: "deferred"`

This is a SQLite transaction-start/locking choice, not an Effect scheduling option and not a durability callback. Plain `BEGIN` already means deferred: SQLite starts the read or write transaction at the first access. Immediate/exclusive modes change when write locks are acquired. The Drizzle SQLite configuration exposes those database-specific choices, with driver-specific support. [SQLite transaction documentation](https://www.sqlite.org/lang_transaction.html#deferred_immediate_and_exclusive_transactions), [Drizzle SQLite transaction modes](https://orm.drizzle.team/docs/sqlite/connect-turso-database#transaction-modes).

Zerospin callers do not choose a mode. `makeTx` unconditionally passes deferred for every transaction. The custom `SqliteSession` turns it into `BEGIN deferred`; omitting it produces `BEGIN`. The installed Durable SQLite adapter instead throws whenever `config.behavior` is present and otherwise delegates to `storage.transactionSync()`. Thus the present option both restates one adapter's default and breaks another actual adapter. [makeTx:71–78](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/make/makeTx.ts#L71-L78), [custom SqliteSession:107–120](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/SqliteSession.ts#L107-L120), [installed fork Durable SQLite adapter:35–40](../../packages/core/node_modules/drizzle-orm/durable-sqlite/session.js#L35-L40).

**The proposed one-line deletion does not compile as written.** A TypeScript `CompilerHost` check removed only `behavior: 'deferred'` from the source in memory and ran without emitting files. The `db.transaction(..., config)` call produced `TS2559`: `Type '{ onCommit: (() => void) | undefined; }' has no properties in common with type 'SQLiteTransactionConfig'.` `IDb` exposes Drizzle's `SQLiteAsyncDatabase.transaction`, whose configuration type only contains optional `behavior`; the custom adapter's additional callback is absent from that shared type. The hardcoded behavior supplies a common property today. That is an observed type relationship, not proof it was the author's intent. [IDb database surface:186–197](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/types.ts#L186-L197), [makeTx call and configuration](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/make/makeTx.ts#L71-L103), [installed Drizzle transaction declaration](../../packages/core/node_modules/drizzle-orm/sqlite-core/async/db.d.ts), [installed config:15–17](../../packages/core/node_modules/drizzle-orm/sqlite-core/session.d.ts#L15-L17).

### `onCommit`

This is not part of the installed Drizzle `SQLiteTransactionConfig`; that interface contains only `behavior`. Zerospin extends the signature of its custom `SqliteSession` and calls the callback after SQL `COMMIT`, before publishing table-change observations. The Durable SQLite adapter ignores `onCommit`; a source search of the installed fork finds no implementation of that callback in its drivers. It is not a portable adapter guarantee. [Installed Drizzle config:15–17](../../packages/core/node_modules/drizzle-orm/sqlite-core/session.d.ts#L15-L17), [custom SqliteSession:107–137](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/SqliteSession.ts#L107-L137), [installed Durable SQLite adapter](../../packages/core/node_modules/drizzle-orm/durable-sqlite/session.js#L35-L40).

There are exactly two authored `onCommit` callers: Aggregate and Service session staging. Each captures the encoded original staged command, then invokes `onCommandStaged` after its local SQLite changes commit. The browser binding writes that original to its recovery journal. The journal is best effort: storage-policy, quota, serialization, and access errors are swallowed; the entry is removed only after validated Node retention coordinates arrive. [Aggregate staging:48–56,98–121](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx.ts#L48-L56), [Service staging:42–47,99–102](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/serviceSession/stageServiceSessionCommandTx.ts#L42-L47), [journal write:38–48](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts#L38-L48), [journal binding and acknowledgement:86–116](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/browser/src/stagedCommandJournal/recoverStagedCommands.ts#L86-L116).

The current ordering is significant: **SQL commit → journal attempt → table-change observers → transaction return**. `finishTransaction()` synchronously flushes observations; observers may reenter application code. Moving the journal call to ordinary code after `makeTx` returns changes this ordering. A replacement must preserve the journal attempt before committed state becomes observable. This is a staging/publication requirement, not evidence for arbitrary generic post-commit callbacks. [SqliteSession:122–137](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/SqliteSession.ts#L122-L137), [makeCommitObservation](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/makeCommitObservation.ts#L12-L31), [observer loop and isolation](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts#L222-L240).

Existing Aggregate and Service staging tests explicitly assert the callback ran before table observers. These are source assertions inspected here, not test runs performed for this note. [Aggregate ordering assertion:293–308](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/tests/session-staging-inverses.spec.ts#L293-L308), [Service ordering assertion:567–584](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/tests/session-staging-inverses.spec.ts#L567-L584).

The custom adapter swallows callback errors after commit, and observation publication separately isolates listener errors. Both preserve the committed SQL result: a throwing observer cannot honestly turn a committed write into a rolled-back transaction. [SqliteSession:124–137](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/SqliteSession.ts#L124-L137), [makeCommitObservation:23–31](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/makeCommitObservation.ts#L23-L31).

### `rollback: "always"`

This is Zerospin's own execution mode. It evaluates a synchronous program, forces SQL rollback even on success, and returns the captured successful result. Exactly two authored callers use it: Aggregate and Service session validation, which rehearse ordinary command evaluation against current state without retaining mutations. The use case is real; an explicitly named rehearsal operation could describe it more accurately than a generic transaction option. That naming is a design proposal, not an implementation recommendation already validated. [makeTx:87–113](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/make/makeTx.ts#L87-L113), [Aggregate validation:68–86](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/aggregateSession/validateAggregateSessionCommand.ts#L68-L86), [Service validation:23–40](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/serviceSession/validateServiceSessionCommandTx.ts#L23-L40).

## Atomicity, durability, and publication are different facts

Cloudflare `transactionSync` requires a synchronous callback and rolls back when it throws. `storage.sync()` is the separate asynchronous operation that confirms pending writes have completed. Output gates hold outgoing network messages until pending writes complete. The current browser `onCommit` callback is neither that durability acknowledgement nor Node acceptance. [Cloudflare transactionSync and sync](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transactionsync), [Cloudflare output gates](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/#understand-how-input-and-output-gates-work).

SQLite `BEGIN` transactions do not nest; SQL uses savepoints for nesting. Zerospin separately rejects nested `makeTx` calls with a module-global `inTxAlready` flag and exposes `withSavepoint` for subordinate rollback. The custom SQLite adapter implements nested calls with savepoint SQL; the Durable SQLite driver implements nesting through `transactionSync` again. Therefore portable rollback behavior belongs at the adapter seam, while Zerospin's prohibition on nested top-level transaction programs is a separate policy. [SQLite nesting](https://www.sqlite.org/lang_transaction.html), [makeTx:13,67–70,99–104](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/make/makeTx.ts#L67-L104), [withSavepoint](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/withSavepoint.ts#L33-L93), [custom savepoints](https://github.com/morgs32/zerospin/blob/27074a62a0a38b1b75b7df81c4a22a6defb36a85/packages/core/src/drizzle/SqliteSession.ts#L168-L199), [installed Durable SQLite nested transaction](../../packages/core/node_modules/drizzle-orm/durable-sqlite/session.js#L41-L47).

## How the coupling arrived

Commit `da44eb2ec3` / PR #105 added `onCommit` to `makeTx`, widened only the custom `SqliteSession`, and simultaneously introduced the unconditional deferred configuration. The previous `makeTx` simply called `db.transaction(callback)` and exposed only optional forced rollback. This makes the regression's origin concrete: browser recovery ordering was threaded through an adapter-shaped configuration used by every transaction. [The exact commit diff](https://github.com/morgs32/zerospin/commit/da44eb2ec39311755f15456e57e1dedd14eba711).

## Historical first-principles conclusion

Keep three required behaviors explicit: synchronous atomic SQL execution with preserved failure causes; rehearsal with discarded writes; and staging recovery intent established before committed-state publication. Remove unsupported/default-only database policy from the shared interface. Put native transaction mechanics in the real SQLite/DO adapters, and put the journal/publication ordering in the module that owns staging. A generic callback masquerading as portable Drizzle configuration does not establish those guarantees across adapters.

Deleting `onCommit` without replacing that ordering would regress recovery. Preserving it unchanged merely because the journal needs ordering would preserve the wrong seam. The next design pass should decide how the staging owner controls publication before choosing function names, factories, or new options.

Two focused proposals deserve comparison: let the staging owner hold committed-change publication across its SQL transaction and journal attempt, leaving `makeTx` concerned with atomic SQL; and express validation rehearsal as its own explicit operation instead of a mode flag. Neither proposal earns its keep if it merely renames the same hook or spreads observer-lifecycle knowledge into ordinary domain callers.

No tests or runtime checks were run for this research. The no-emit, in-memory TypeScript check above supplies static evidence that the one-line repair is incomplete; remaining findings are verified against the cited source and official documentation. The proposed ownership change remains a design hypothesis.
