# Standalone authority and storage scope

**Date:** 2026-10-08; amended 2026-10-27
**Status:** Accepted
**Implementation:** [Plan 072](../archive/plans/072-plan-standalone-sharedworker-execution.md), [Plan 143](../archive/plans/143-plan-remove-remaining-binding-concepts.md), [Plan 234](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md), [Plan 247](../archive/plans/247-plan-standalone-session-lock-storage.md), [Plan 248](../archive/plans/248-plan-sharedworker-owner-cleanup.md), and [Plan 281](../archive/plans/281-plan-standalone-staged-command-journal.md). Plan 234 owns its historical runtime verification record; Plan 281 records completed verification of the journal and original-claims changes.

## Context

Persisting each tab's SQL cannot serialize two tabs' read-modify-write programs against one authoritative state. Including incidental claims or compiled builds in persistence identity splits one intended history. Attached sessions still need immediate staging before authoritative local execution.

## Decision

Keep synchronous staging per session and one authoritative SharedWorker AggregateNode. Storage identity is aggregate/Actor versions, session name, generated backup path and the complete canonical `aggregateSessionLock`. The lock includes the claims schema, selected models and public contracts; incidental claims values outside the generated path and compiled builds remain excluded. Both the tab and application worker derive this identity independently. The key and sharedWorkerVersion select the SharedWorker name; `/zerospin/standalone/${key}` selects the stable SQLite namespace and namespace lease independently of that version. Retain one aggregate ID and exact session lock for the storage owner. Validate every attachment against the authored claims schema and its generated path/owner, while retaining each original's complete invocation claims independently of the receiving attachment.

The page uses the shared Aggregate staged-command journal under the existing
`standaloneStorageKey`, original `nodeId` and original `{ sessionId, sessionIndex }`.
A best-effort per-command localStorage write runs after successful staging SQL
COMMIT, before committed-table observers and before staging returns. This is
pending delivery state; `AggregateNode` remains the sole authoritative local
command history. The shared recovery path submits complete originals and removes
entries after validated original retention, without waiting for authoritative
execution or final retention. Storage access failure preserves ordinary staging
and handoff. Reset rotates `nodeId`, so old entries cannot enter the replacement
Node incarnation.

Original reception does not require complete equality with a later attachment's
claims. Non-path claims may differ within the same storage owner. Each new
original still satisfies the authored claims schema; its decoded
`claims.aggregateId` must equal `command.aggregateId`, and Node retention checks
that ID against the storage owner along with Aggregate/Actor/session identity and
registered contract version. Exact retries retain their original claims and
allocation. Authoritative execution evaluates those captured claims, including
when recovery is delivered by another valid attachment. Changing a later
attachment's incidental claims does not revoke a pending original. Empty command
pages return without accepting input or requesting the execution drain.

The application worker imports the same pure session definition as the tab release and supplies its own execution dependencies. Its existing ManagedRuntime owns both authoritative execution and derived optimistic replay. No tab runtime is borrowed and no second standalone dependency runtime is acquired.

The namespace lifetime Web Lock covers opening SQLite through final close. The Node gate and BEGIN IMMEDIATE cover authoritative evaluation, ordered operation application, final retention and resource/checkpoint commitment. Original/final history, producer admission, public checkpoint and pause/manual controls retain distinct responsibilities. Optimistic replay cannot synthesize a final or advance the authoritative checkpoint.

Reuse [ADR 003's publication model](003-immutable-node-command-history-and-submission-order.md): one derived in-memory Node graph, exact owned-input coverage, compact final resolutions and minimal retention coordinates. Sessions install the graph atomically and replay only their own uncovered originals. Each attachment receives its own bound claims; Node replay uses each original's retained claims even when another attachment has different valid claims. Session command rows never copy other attachments' history.

Reset validates fixed schema and aggregate owner before replacement, acknowledges live attachments outside SQL, atomically reseeds authoritative resources/history and rotates nodeId. Explicit reset operates only within the current session-definition partition; it does not transfer data between session locks or replace a different aggregate or unsupported framework schema. Standalone reset preserves pushPaused. Resource checkpoint pairs remain null until a valid baseline commits.

The SharedWorker host retains its connection listener while successive resource owners acquire the Node, SQLite/VFS, synchronization resources and namespace lease. A valid bootstrapped client acquires an owner lazily. Each connection holds a unique document-owned Web Lock before worker construction; the host watches its release to detect abrupt document loss independently of namespace exclusion. Hidden, frozen and cached documents remain clients while the browser retains their locks.

Last-client departure prevents new owner work, retires remote waits, drains admitted execution/SQL, closes the derived graph and durable storage, and only then releases namespace ownership. An arrival during cleanup waits for complete closure and receives a fresh owner over the same retained database. A cleanup failure attempts independent releases but retains the namespace and rejects replacement acquisition. The lightweight host stays reusable after successful cleanup. Public `session.dispose()` establishes that facade's local cleanup; it does not acknowledge shared-owner drainage or remote command finalization.

Standalone readiness awaits the namespace lease, and the tab observes loss of that physical namespace. A different application build using the same namespace waits for ownership independently of artifact validation. A changed session lock selects a different namespace and lease; its initialization does not wait for the old partition's owner. This cleanup change preserves Plan 247's storage identity and existing data. Workers running older code cannot adopt cleanup retroactively; their owners must release before same-namespace adoption.

## Alternatives and consequences

A SQL backup preserves output but cannot reevaluate guards or prevent lost updates. Per-claims databases split intentionally shared paths; per-build databases split persisted history. A separate authoritative Standalone journal or a session-history importer duplicates Node ownership. The shared page journal retains only pending original delivery and retires entries after Node acknowledgement; it neither replaces retained Node history nor copies model rows.

Adding the session lock changes every preexisting standalone key on first adoption, so each session initializes a fresh partition from its configured seeds. Old databases remain untouched and unused; there is no lookup, migration, deletion or fallback. Later, the same authored scope, generated path and lock reopen the same partition. Changing the lock opens a separate partition; returning to an earlier lock reopens that lock's retained partition without merging data.

Local staging returns after its best-effort journal attempt and before guaranteed durable Node retention or authoritative execution. A journaled original can survive document closure before Node retention; a retained original survives tab disposal in Node history. Both preserve captured claims and staging time on recovery. External async workflows remain outside standalone execution. Current AggregateNode storage uses schema 22; Native replica storage independently uses schema 11. The original Plan 234 projection cutover used 17/6, before later command-storage changes. These are fixed-schema compatibility gates, with no row translation, compatibility path or automatic schema reset. Agent and Service backend storage remain independently owned.
