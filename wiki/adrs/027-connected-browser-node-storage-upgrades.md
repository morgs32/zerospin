# Connected browser Node storage upgrades

**Date:** 2026-11-05

**Status:** Accepted. [Plan 293](../archive/plans/293-plan-connected-node-storage-upgrades.md) records the original implementation. The offline migration amendment below is specified in [MOR-486](https://linear.app/morganatwork/issue/MOR-486).

**Amends:** only connected browser storage identity and schema evolution in [ADR 003](003-immutable-node-command-history-and-submission-order.md). Its immutable command-history, producer-ordering and view-ownership decisions remain governing.

## Context

Connected browser databases previously included the compiled runtime/WASM hash in
their physical names. A new executable therefore selected fresh storage even
when the authenticated session binding and command representation were unchanged.
Pending work remained in the old namespace. A button-level app update guard could
not establish continuity across closed tabs, cold startup or service-worker
activation.

The Node owns the command history and the exclusive physical-storage lease. It
can distinguish admission progress from retained canonical finals and can retain
those finals with resource deltas/checkpoints atomically. A supported historical
SQL format can use the current transport without re-authoring its commands when
the authored binding and command-wire meaning are unchanged.

## Original decision (amended below)

1. Key migration-aware connected Aggregate and Service SQLite namespaces by the
   complete authenticated `sessionKey`, independently of `sharedWorkerVersion`.
   Keep runtime hashes in executable routing/handshake and exact artifact checks.
   Use stable family discovery databases with the same eligibility, revocation
   and identity validation responsibilities.
2. Retain one exclusive namespace lease through inspection, strict journal
   bootstrap, old-format drainage, migration and ordinary Node lifetime. Distinct
   executables wait for that same lease; they do not hot-swap an active owner.
   Newer/unsupported formats and invalid upgrade state must never authorize
   automatic reset or fresh-producer replacement.
3. The first migration-aware baseline is SQL layout 22 with an owner-local
   `applied_migrations` ledger at baseline 0 and no production ALTER edge. Future
   supported edges have immutable IDs, version bounds, ordered SQL and checksums.
   SQL, the version stamp and ledger entry commit together per forward edge;
   errors roll back that edge and preserve earlier committed history. There are
   no automatic down migrations.
4. Before a pending upgrade, keep attachment readiness withdrawn and strictly
   import successfully persisted tab-journal originals for this exact identity
   and producer. The initializing page reads its localStorage; the receiving
   Node validates and retains the unchanged originals before acknowledging them.
   Snapshot values are paged independently of key deletion. Completion means
   durable Node coverage, not physical journal emptiness. Best-effort writes that
   never persisted are not recoverable by this mechanism.
5. Freeze `pushIndex` after import. Synchronize until contiguous `outcomeIndex`
   covers the entire prefix, retaining normal final/resource transactions. An
   execution-refusal final closes a position; admission alone does not. Stop and
   join the synchronizer before local forward SQL, then validate the current
   graph/history and resume ordinary attachment. Preserve command IDs, original
   payloads/claims, version bindings, producer coordinates and retained history.
6. Scope this lifecycle to unchanged exact authored bindings and supported Node
   physical layouts. Authored model/contract/Actor changes, command-wire changes,
   Standalone, Native and Agent storage remain separate policies. Constructors,
   managed hooks and session definitions gain no application migration callback.

### Connected command storage and rebuildable reads (MOR-486)

The durable command format covers the Node's producer, binding, original commands,
admission progress and retained final records. A separate read baseline and
per-table definitions let the Node reconstruct confirmed resources and apply its
unresolved originals in order. An obsolete read table can be rebuilt offline
when the last authenticated baseline and contiguous history cover its checkpoint.
If they do not, wait for a fresh authenticated snapshot. Publish a complete
checkpoint and view in one transaction. A view-only rebuild leaves the command
format and producer positions untouched.

The shipped 48.0.0 and 48.0.1 Aggregate formats both used SQLite stamp 24.
Adoption validates their respective migration records and command schemas.
When adopting the earlier lineage, the Node archives its exact ledger before
stamping the current baseline in the same transaction.
Unresolved prerequisites whose original behavior is unavailable block adoption
and leave the records available to a compatible reader.

#### Offline migration of pending commands (2026-11-19)

An app update may reach a browser that closed its last tab after saving a move
offline. A supported change to how the Node stores that move can proceed while
it is still offline. This amends the finalization requirement in original
decision 5. Authors append ordered SQL steps in the family database declaration, alongside its current Drizzle tables. Under the existing storage lease, the Node applies the migration
and records it in the same SQLite transaction. It retains the original command
ID, payload, claims, binding, producer order, admission progress, and known
outcomes. It preserves the meaning of any pending prerequisite. A paused
producer stays paused. On reconnect the usual synchronization path resumes
from the saved progress, including recovery of an outcome after a lost reply.

For example, renaming a column can preserve every saved move. Requiring a
server reply before that rename would prevent an offline user from opening
the updated planner. Removing an unfinished prerequisite changes what the
command can do. If the new runtime cannot honor it, preserve the original
data and report the specific work that requires the compatible runtime.
Successfully staged edits in a matching tab journal must also remain
recoverable. Read-table rebuilding and explicit development-history
replacement retain the separate rules above.

The local CLI records the histories replaced by an explicit whole-System clean.
Authenticated discovery compares that evidence before opening SQLite. A matching
transition selects a separate physical file under the same identity lease and
keeps the preceding file and tab journals scoped to their old producer. Stale
producer registration is fenced at the destination. Missing evidence, including
a missing producer by itself, preserves retained work. When a local worker is
serving requests before the CLI has accepted its startup spec, session
authorization reports a transient failure. The browser retries authentication
and waits for the accepted System to supply its normal snapshot.

## Alternatives and consequences

Keeping runtime-hash storage would isolate executables but continue to strand
pending work at ordinary runtime upgrades. Requiring a global app update barrier
would move coordination into documents and HTTP service workers without giving
them ownership of the Node log. This decision instead serializes storage owners
and preserves concrete historical SQL support at the Node.

The original implementation waited for finals before a general migration. The
offline amendment removes that dependency for changes that preserve command
meaning. A live older-runtime tab can still delay a newer attachment because it
holds the exclusive lease on the same database.

This begins a new baseline. First consumer adoption requires draining work with a
compatible pre-baseline runtime and retiring its clients. Existing runtime-hash
databases and discovery records are not scanned, adopted, copied, reset or deleted.
This decision authorizes no publication, deployment or consumer adoption. Stable
physical names and retained migration history make future storage compatibility
an explicit commitment rather than a consequence of executable identity.

## Sources

1. [Connected namespace selection](../../packages/browser/src/Node/nodeStorageNamespaces.ts), [Aggregate discovery](../../packages/browser/src/AggregateNode/aggregateSessionDiscovery.ts) and [Service discovery](../../packages/browser/src/ServiceNode/serviceSessionDiscovery.ts).
2. [Node history definitions](../../packages/core/src/Node/nodeMigrationHistory.ts), [ledger transactions](../../packages/core/src/Node/nodeMigrationLedger.ts) and [physical schema validation](../../packages/core/src/Node/validateNodeStorageSchema.ts).
3. [Aggregate migration declaration](../../packages/core/src/AggregateNode/aggregateNodeDatabase.ts), [Service migration declaration](../../packages/core/src/ServiceNode/serviceNodeDatabase.ts) and [strict journal snapshot](../../packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts).
4. [Storage-owner cleanup](../../packages/browser/src/Node/closeNodeStorageOwner.ts) and [upgrade recovery exclusions](../../packages/browser/src/Node/shouldResetConnectedNode.ts).
