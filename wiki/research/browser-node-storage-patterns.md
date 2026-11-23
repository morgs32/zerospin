# Choosing a format for a connected browser Node

A planner edit made offline must survive an ordinary app update. An explicitly cleaned development System should open a fresh workspace even if the new app cannot open the previous browser database. Which records can we get back, from where, and with what meaning? The answers determine how much machinery each path needs.

## What Zerospin calls a layout

The phrase comes from the connected Node design decision. It calls 22 a “SQL layout”. The code calls the field `version` on `aggregateNodeStorageV22` and `aggregateNodeStorageV24`. SQLite gives applications an integer for this, `PRAGMA user_version`. Zerospin also checks the migration records, then the actual tables. The user-facing label I would use is **browser database format**. If the single internal field survives, use **`nodeStorageFormatVersion`** where its owner needs spelling out. SQLite also has a `schema_version` pragma for its own schema-change tracking. Leave that to SQLite. [Node decision](../adrs/027-connected-browser-node-storage-upgrades.md#decision) · [Stored version and read order](../../packages/core/src/Node/nodeMigrationLedger.ts) · [SQLite pragmas](https://www.sqlite.org/pragma.html#pragma_user_version)

A concrete pair from the prior artifact investigation, abbreviated to show the comparisons:

```ts
// Both published AggregateNode formats, after creating their current tables
oldFile.user_version === newRuntime.version; // 24 === 24
oldFile.appliedMigrations.length > supported.length; // 3 > 1: reject
```

These are pseudocode names. The length check is the first failure for the old fully upgraded file. Shorter old histories can fail the baseline checksum instead. The old 24 also retains `commandDependencies`; the newer 24 omits it. An original with a predecessor can require the predecessor’s definitive outcome before it may execute. Reassigning the integer or accepting any file stamped 24 cannot preserve that promise. The packages exhibit this incompatibility. The affected browser’s ledger has not been read. [Artifact comparison](./connected-browser-node-storage-from-first-principles.md#what-the-two-published-layouts-prove) · [Actual length and checksum checks](../../packages/core/src/Node/nodeMigrationHistory.ts) · [Old dependency handling](https://github.com/morgs32/zerospin/blob/c55222cafa0630a34e57f716462edd7b7bdac1fe/packages/core/src/AggregateNode/AggregateNode.ts#L966-L1012)

Three plausible changes illustrate what the name conceals. A new planner index changes how to **read** already-known work. Removing `dependsOn` changes when an original may **execute**. Running `dev --clean` replaces **which System history** a command belongs to. A table fingerprint can detect the first. The latter two require knowing the command's binding and the identity of its destination history. The current connected browser namespace is derived from the authenticated `sessionKey`. Framework storage and a local backend reset can change independently of that key. [Namespace selection](../../packages/browser/src/Node/nodeStorageNamespaces.ts) · [Definition and binding](../../packages/browser/src/AggregateNode/makeAggregateNodeDefinition.ts) · [Current reset policy](../archive/plans/308-plan-local-reset-browser-recovery.md)

## How LiveStore reopens a browser store

LiveStore 0.5.0 persists the events that can reconstruct a view. The web
adapter opens `eventlog.db` and `state<fingerprint>.db` in the same directory.
By default its name contains the app's `storeId` and the framework's storage
format number. Changing a table selects a new state file in that directory.
The log records each event's name, encoded arguments, sequence and parent
positions, originating client and session, and event-schema hash. It also
stores the last known backend head and backend ID. [Release][ls-release] ·
[Web files][ls-web-files] · [Directory][ls-dir] · [Log tables][ls-log]

**What triggers a rebuild.** `makeState` computes a SHA-256 fingerprint of
the declared application and framework state tables. The canonical input
covers table names, column order, storage types, constraints, defaults,
indexes and declared JSON shapes. It normalizes table and index ordering
and represents a runtime default function by its presence. The materializer
functions are stored separately. Consequently, editing only a handler, such
as changing how it computes a total from the same events into the same
column, leaves a completed state file eligible for reuse. Development
builds also hash the SQL operations a handler produces for a particular
event to catch disagreement between the session and leader. That check
cannot trigger rematerialization of old rows on deployment. [State construction][ls-make] ·
[Fingerprint inputs][ls-descriptor] · [Digest][ls-digest] ·
[Boot decision][ls-boot] · [Materializer output comparison][ls-output]

**What survives.** For a new or incomplete state file the leader starts with
empty derived state, creates the tables, replays the whole local log in
order, runs the final migration hook, and writes a completion marker.
Changing one table incurs the full replay. An interrupted rebuild retries
from empty derived state. The leader reconstructs its pending list from
the log positions after the stored backend head, so work already persisted
by the leader can survive an ordinary projection upgrade offline. A hard
crash can still lose a client commit before the leader acknowledges it.
[Schema migrations][ls-migrations] · [Rebuild and marker][ls-rebuild] ·
[Pending reconstruction][ls-pending] · [Release notes][ls-release]

**Who can still read an old event.** LiveStore recommends versioned event
names and retaining their definitions. Compatible changes include adding
an optional field or one with a default. On replay, a difference between
the stored event-schema hash and `Schema.hash(currentEventDefinition.schema)`
produces a warning. For a known event with a materializer, the runtime then
decodes the actual stored arguments and fails the rebuild if that decode
fails. Older clients that encounter unknown events default to warning and
continuing. Applications can choose to stop instead. [Events and evolution][ls-events] ·
[Replay decoder][ls-decode]

**Where preservation ends.** LiveStore separately maintains an integer for
the event-log storage format, currently `6` in this release. Its source
requires bumping it for client event-log schema changes. The new directory
leaves the old files on disk and outside the normal open path. Unsynced
work in the old format needs a reader or recovery step to reach the new
store. [Framework storage version][ls-format] · [Directory selection][ls-dir]

**How it detects a backend reset.** The Cloudflare backend keeps a random
`backendId` for the lifetime of its stored history. A push carrying a
different known ID is rejected before insertion. By default the client
clears its event log, sync status and state tables and shuts down on
mismatch. This discards locally pending events too. Applications can choose
to shut down with the data intact or continue with stale local data. A
change of backend identity shows which history the browser reached. It
does not establish who authorized resetting the browser. [Backend ID creation][ls-backend-id] ·
[Push check][ls-backend-push] · [Reset options][ls-reset] ·
[Client cleanup][ls-clean]

## Four choices for Zerospin

Each choice must handle an offline planner edit, an app update before the tab reopens, and a lost response after the Chain already admitted the edit. “Send it again” is safe only with the original identity, producer position and binding, and a destination that recognizes them. Admission alone does not prove the browser has the definitive outcome. [Node command history](../adrs/003-immutable-node-command-history-and-submission-order.md) · [Original retention](../../packages/core/src/AggregateNode/acceptAggregateOriginalTx.ts) · [Final retention](../../packages/core/src/AggregateNode/retainAggregateFinalTx.ts)

**1. Migrate the existing SQLite database.** Keep one immutable format number per released meaning. For each supported upgrade, convert the previous data under the Node’s existing exclusive lease and commit the change with its stamp. Firestore’s SDK provides a concrete example. Its migrations rewrite pending mutations preserving batch IDs and clear rebuildable indexes in another upgrade. Android Room exports schemas and supports testing an actual upgrade before release. The cost is maintaining and testing a path from every supported starting point, including the two already-shipped variants of 24 if support is required. The benefit is preserving a working offline database without a full replay for mechanical changes. A semantically incompatible pending command still needs its original execution rules. [Firestore migrations](https://github.com/firebase/firebase-js-sdk/blob/main/packages/firestore/src/local/indexeddb_schema_converter.ts) · [Room migrations](https://developer.android.com/training/data-storage/room/migrating-db-versions#test-all) · [Current Node lease and drain](../adrs/027-connected-browser-node-storage-upgrades.md#decision)

**2. Keep original work durable and rebuild the readable tables.** Borrow LiveStore’s distinction. For Zerospin, retain original commands with identity, binding, producer progress and the final evidence needed for retry. Reconstruct planner rows from an authoritative snapshot and compatible local work. A local source for the last snapshot or replayable history earns its keep if rebuilding must work offline. A device without either source must preserve the edit and wait to refresh the view. A database fingerprint can select new tables automatically. A change to projection logic with identical declarations requires its own invalidation signal, for example using the existing applicable release identity when it already covers that code. Keep the existing atomic write of outcome, progress and view changes until publication of a rebuilt view is explicitly recoverable after an interruption. This can be a logical division in one file. [Current final transaction](../../packages/core/src/AggregateNode/retainAggregateFinalTx.ts) · [View and history responsibilities](../adrs/003-immutable-node-command-history-and-submission-order.md) · [LiveStore fingerprint](https://github.com/livestorejs/livestore/blob/v0.5.0/packages/%40livestore/common/src/schema/state/sqlite/db-schema/ast/fingerprint.ts)

**3. Let old and new clients coexist and drain the old work.** Replicache groups compatible clients. Its recovery code looks for pending mutations in other groups with supported storage and pushes the old group’s records under its stored schema version. If the destination reports an unsupported version or missing client state, recovery disables that group. For Zerospin this would mean opening a new view while retaining the original producer and binding for old work. A surviving old reader and compatible addressed release must still understand it. Enforce the original ordering where new work depends on old work. Retirement must account for closed offline browsers, which the Chain cannot enumerate. This buys independent rollouts at the price of overlapping releases. Zerospin’s existing deployment handbook already explains the V9/V10 execution side. [Replicache recovery](https://github.com/rocicorp/mono/blob/main/packages/replicache/src/mutation-recovery.ts#L228-L408) · [Versioning a mutator](https://doc.replicache.dev/howto/launch#js-sdk) · [Zerospin release overlap](../../docs/content/handbook/versioning-and-deployment.md#replace-browser-bundles-before-removing-an-aggregate-release)

**4. Keep stable stored records and change the SQL views over them.** PowerSync’s JSON-backed views let different client schemas read the same underlying records. It also documents overlapping named sync streams when a breaking rename must serve two generations. In a planner, adding a display field can become a view change instead of a rewrite of every offline row. A field’s meaning still needs a compatible interpretation, and write admission still needs its own rules. The price is query and indexing tradeoffs compared with native typed tables. This would be attractive if changing planner read schemas accounts for most migration pain. It would have limited value for this specific framework change to command prerequisites. [PowerSync SQLite representations](https://docs.powersync.com/client-sdks/advanced/raw-tables) · [Multiple client versions](https://docs.powersync.com/sync/advanced/multiple-client-versions) · [Handling writes](https://docs.powersync.com/handling-writes/handling-write-validation-errors)

**A smaller choice for a disposable dev System.** If local work is disposable across an explicit whole-System clean, the CLI can start a new history and the authenticated browser can select new storage for it. That alone can fix the reported development workflow without first designing migrations for every abandoned experiment. An ordinary app reload or dependency upgrade on the same history still needs one of the four approaches if offline edits must survive it. Existing installs without independently readable history evidence need an explicit first cutover. [Local reset contract](../archive/plans/308-plan-local-reset-browser-recovery.md) · [LiveStore’s independent backend ID][ls-reset]

## What transfers from further afield

- **Separate the ability to read from permission to write.** SQLite can permit reading when the file’s read version is supported and its write version is too new. Delta Lake’s table features distinguish reader and writer requirements. That is a precedent for letting someone inspect or recover a queued edit using a compatible reader when execution is unavailable. Read-only mode requires a reader that actually understands that data. A general capability matrix adds little while Zerospin has a single reader/writer combination. [SQLite file header](https://www.sqlite.org/fileformat.html#file_format_version_numbers) · [Delta Lake protocol](https://docs.delta.io/versioning/)
- **Record what wrote an individual message.** Avro single-object encoding carries a writer-schema fingerprint so a reader can resolve the actual record. Zerospin already has a command name, contract version and addressed binding. Reuse them. A structural decoder cannot establish whether an old “amount” was cents or dollars, or whether an old predecessor must finish first. [Avro encoding and resolution](https://avro.apache.org/docs/1.12.0/specification/#single-object-encoding) · [Zerospin command types](../../packages/core/src/contracts/types.ts)
- **Publish a replacement only when it is usable.** Iceberg allows readers to keep using an old snapshot while a writer builds a new one. The writer verifies its starting point before committing the new pointer. This is a model for a large projection rebuild with concurrent edits. A small projection rebuilt under the existing Node lease can be simpler. Temporal pins in-progress workflows to a compatible deployment, another precedent for finishing old work under its original execution rules. [Iceberg snapshot publication](https://iceberg.apache.org/spec/#optimistic-concurrency) · [Temporal pinned workflows](https://docs.temporal.io/worker-versioning#pinned-workflows)

## What I would pick

Use the second approach for connected browser Nodes. Reserve a deliberately versioned format for what only the browser can know. Use the first approach when that smaller durable format really changes. Use side-by-side releases when there is an actual need to complete work with older command semantics. Test a candidate against the databases produced by previously served packages, including a command queued offline and one admitted before the reply was lost. Test both V24s. A new version number does not settle how to support those two files. [Existing artifact comparison and release check](./connected-browser-node-storage-from-first-principles.md#1-make-shipped-storage-compatibility-a-release-gate)

Treat `dev --clean` independently. The existing authenticated call `aggregateNodeNetwork(request, admission).snapshot(null)` happens before the browser opens the retained Node. I would expose a verified clean transition there and record the previous history independently of the database that might fail to open. A matching transition allows the browser to open a fresh Node, fence the old producer and leave its original commands associated with the old System. Ordinary restart keeps the same history. Offline, ambiguous backend identity or an unreadable legacy file without independent evidence requires preservation and an explicit recovery path. A broken schema, failed connection or missing producer alone does not prove an intentional whole-System clean. This is a design proposal. [Existing early snapshot](../../packages/browser/src/AggregateNode/resolveAggregateNode.ts) · [Current recovery exclusions](../../packages/browser/src/Node/shouldResetConnectedNode.ts) · [Recovery ordering and legacy transition](./connected-browser-node-storage-from-first-principles.md)

The end-to-end check I would use is to move a task offline, close the browser, deploy a build that changes the planner table, and reopen. The move should remain visible when the device has enough cached data to rebuild and should reach the original Chain once with its original identity. Repeat with a lost admission response. Then explicitly clean the dev System and reopen the same old browser. The new planner should boot, and the old move must never be applied to that fresh history. Also leave an old tab open for the cutover. Those outcomes are what the choice of storage design needs to buy.

[ls-release]: https://github.com/livestorejs/livestore/releases/tag/v0.5.0
[ls-web-files]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/adapter-web/src/web-worker/leader-worker/make-leader-worker.ts#L215-L225
[ls-dir]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/adapter-web/src/web-worker/common/persisted-sqlite.ts#L137-L154
[ls-log]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/schema/state/sqlite/system-tables/eventlog-tables.ts#L16-L60
[ls-make]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/schema/state/sqlite/mod.ts#L25-L65
[ls-descriptor]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/schema/state/sqlite/db-schema/ast/fingerprint.ts#L39-L123
[ls-digest]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/schema/state/sqlite/db-schema/ast/fingerprint-digest.ts#L1-L6
[ls-boot]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/leader-thread/make-leader-thread-layer.ts#L115-L132
[ls-output]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/leader-thread/materialize-event.ts#L67-L87
[ls-migrations]: https://docs.livestore.dev/building-with-livestore/state/sqlite-schema/#schema-migrations
[ls-rebuild]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/leader-thread/recreate-db.ts#L47-L85
[ls-pending]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/leader-thread/make-leader-thread-layer.ts#L290-L331
[ls-events]: https://docs.livestore.dev/building-with-livestore/events/#schema-evolution
[ls-decode]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/rematerialize-from-eventlog.ts#L39-L104
[ls-format]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/version.ts#L21-L38
[ls-backend-id]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/sync-cf/src/cf-worker/do/layer.ts#L99-L119
[ls-backend-push]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/sync-cf/src/cf-worker/do/push.ts#L44-L75
[ls-reset]: https://docs.livestore.dev/building-with-livestore/syncing/#backend-reset-detection
[ls-clean]: https://github.com/livestorejs/livestore/blob/42a59b73f9fb1ad4204f6c52bcaafc249f15eda7/packages/%40livestore/common/src/leader-thread/LeaderSyncProcessor.ts#L1195-L1262
