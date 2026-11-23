# Live queries

`makeLiveQuery({ client, query })` keeps one synchronous Drizzle query
and its result store. It supports select `.all()` and relational `.sync()` queries.
The returned `subscribe()` installs a committed-table listener before the catch-up
read. Its idempotent cleanup removes that listener when the final subscriber leaves.
No listener is acquired while the query store is constructed during React render.

Browser and native SQLite drivers collect table reads through `SQLITE_READ`
authorizer callbacks during statement preparation and automatic repreparation.
This includes joins, subqueries, raw predicates and the underlying tables of
views, even when a query returns no rows. Each successful read replaces the
dependency set; a query that reads no tables does not rerun on table changes.
Only committed changes to a dependency refresh the query. Changes rolled back
to a savepoint are discarded before the outer commit publishes notifications.
Reentrant commits are processed after the current read and store notification
settle.

React's session `useLiveQuery` result exposes `data` and `updatedAt`. Initial read
failures reach the owning session boundary during render. A failed rerun reports
its original value to `session.reportFailure({ origin: 'session', error })` and
fences execution synchronously before notifying query observers. The query store
records a distinguishable `{ error: unknown }` failure snapshot and ends its
subscription; subsequent commits cannot revive it. The public hook rethrows an
owned `SessionQueryError` when React observes that snapshot. Thrown `null` and
`undefined` remain distinct from no failure and retain their diagnostic cause. No query-local `error` field or stale-data recovery path is
exposed by that hook. A missing row is an ordinary successful result. Observer
failures cannot change the committed write result.

React's `useLiveQuery` and `useLiveQueryOnDb` subscribe during the mounted effect
lifetime. Database and query key determine the store.
`useLiveQuery` configures a committed-read error callback that fails its session.
The lower-level diagnostic `useLiveQueryOnDb` keeps `{ data, error, updatedAt }`
and can recover on later commits when no terminal callback is configured. Its
presentation error preserves a foreign thrown value in `cause`. It
remains usable for diagnostic databases outside the failed session subtree.
Query callbacks are captured when the database or key changes; recreating a
callback on every render does not rebuild it. Keys use `es-toolkit` value equality
for Dates, Maps, Sets and cycles, with function identity. Treat keys as immutable
between renders and supply a new value for a semantic change.
