# Connected browser Node storage from first principles

The requirement is to preserve unsynced work through an ordinary upgrade,
and to let an explicitly cleaned local System start fresh without asking an
obsolete browser database to open first. A release that cannot preserve
supported data must detect that before publication. These are proposals for
connected browser Nodes. Standalone, Native, and production storage reset
policy need their own decisions.

## What the two published layouts prove

SQLite gives the application a header integer called `PRAGMA user_version`.
SQLite never uses the integer itself. For Zerospin, the number helps choose
read/write code for the tables and rows it owns. The migration ledger and
physical schema checks provide additional evidence that the selected code
can interpret the file. The authored session lock and the authenticated
`sessionKey` answer which session the file belongs to.
[SQLite user_version][sqlite-version] · [Node identity][definition] ·
[Migration ledger][ledger] · [Physical schema check][schema]

I instantiated the framework tables exported by the actual Mentor Mailbox
48.0.0 and 48.0.1 Core packages in two in-memory SQLite databases. Both
reported `user_version = 24`. The 48.0.0 version had
`commandDependencies`, `commands` and `nodeMetadata`. The 48.0.1 version
had only `commands` and `nodeMetadata`. The shared table definitions
matched in this probe. The 48.0.0 ledger starts at 22 and has forward
migrations to 23 and 24. The 48.0.1 ledger starts at 24 with a different
baseline checksum. The actual 48.0.1 validator rejects all three prefixes
from 48.0.0. These checks used package artifacts, without opening the
affected browser's database or running a real browser upgrade.
[Prior layout 24][old-layout] · [Layout and history cutover][cutover] ·
[Checksum and exact-prefix validation][history]

The refusal prevented an unsafe open. The release process allowed an
existing format number to mean a different schema and withdrew readers for
an already shipped history. Switching to a hash would distinguish the two
formats, but users would still need either a supported upgrade or an
explicit cutover. A hash of SQL alone also cannot detect changes in what a
stored command means. A simple integer per durable format is sufficient
if release checks enforce its meaning. Keep it internal.

## Prefer three small decisions

### 1. Make shipped storage compatibility a release gate

For each supported published artifact, build a database with that
artifact, stage a pending original, and produce an admitted command
whose final outcome has not reached the browser. Open it with the
candidate package set and run both to completion against the same System
history. Check the original IDs and positions, retained outcomes, and
resource state. Include a fresh database as a control. Select the
predecessor from what was actually served to consumers. A Git manifest
with the same version string cannot establish that its artifacts match
the published package.

Treat shipped layout IDs, ledger definitions and command interpretation
as immutable across supported releases. Evolve a durable format through
an explicit forward step and commit the format change, ledger and updated
rows together. Generated manifests can catch removed edges or conflicting
layout IDs cheaply. Exercise real packaged readers and records to catch
semantic breaks. Retire support deliberately with a drain, archive or
export strategy for pending work. Test each supported predecessor that an
offline client can reasonably skip from. A retired format can lose its
reader once its data is accounted for. Keep fingerprints that newer
supported databases still carry in their ledgers.
[SQLite transactions][transactions] · [Android Room migration testing][room] ·
[Liquibase checksum policy][liquibase] · [Current Node upgrade contract][adr]

For this incident, use both shipped 24 layouts as distinct cases. If both
need continued support, name both source formats explicitly and converge
them on a new common format after checking command compatibility. PR
#157 also removed `dependsOn`. The earlier Node used it to wait for the
exact predecessor's retained authoritative outcome. Dropping that field
from an unresolved original changes when the command can run. Support
needs an exact reader and the old semantics, a compatible runtime and
backend to drain those originals, or a recovery path that preserves
them for explicit handling. The storage checksums must keep distinguishing
the two source layouts. [Prior dependency handling][dependency] ·
[Layout and command cutover][cutover]

If only the
local dev cutover is needed, archive the known old generation and skip
reconciling its old commands into a deliberately fresh System. Which
sources remain supported is a product decision.

### 2. Let an authorized clean choose a new browser namespace first

The current cold start opens and validates the retained SQLite Node before
it can ask about the old producer. The online startup already obtains an
authenticated snapshot before opening that file. Use that earlier response
for reset evidence. The simplest stronger signal would be a durable ID
for the current local System history, plus a transition that identifies
which prior history an explicit `--clean` replaced. Keep an opaque
history ID with the browser's independently readable session discovery
metadata. On a matching authenticated local transition, fence the old
namespace and start the new one before trying to open the old SQLite
file. Scope the Node, replicas and journal to the authorized transition.
Keep the retired file and journal parked so recovery remains possible.
Existing browser discovery, admission and exclusive storage ownership
are the starting points to check.
[Online resolution][resolution] · [Discovery metadata][discovery] ·
[Existing producer check][producer] · [Local reset design][reset-plan] ·
[PostgreSQL timeline precedent][timelines]

A sketch of the normal entry point and calls:

```ts
const { session, snapshot, localClean } = await authenticateAndReadSnapshot();
const previous = await findRememberedNode(session);

if (localClean?.replaces(previous?.historyId)) {
  await fenceAndPark(previous);
  return openFreshNode(session, snapshot);
}

return reopenOrUpgradeNode(previous, session, snapshot);
```

`fenceAndPark` means the local Node stops staging, publishing and importing
old journal entries. The AggregateChain or ServiceChain must reject old
admissions even when a socket send was already in flight. The new Node
registers before staging and its baseline must validate before publication.
Keep the transition idempotent across interrupted startup and multiple
tabs. Ordinary restart preserves the history ID. An unavailable backend,
different account, changed lock, mismatched checkout, and missing local
discovery metadata are insufficient evidence to retire old work. A
legacy Node without a trustworthy remembered binding needs a compatible
reader or an explicit operator decision. An authorized local clean can
start a new history with empty application data, so seeding may still be
necessary. Connected offline operation can use previously verified local
state when readable. It resolves the reset before any new admission after
reconnect.

There is also a smaller option with the existing protocol. Record the
verified Node ID and binding independently of the SQLite layout, then move
the authenticated `registerNode(create: false)` check ahead of the DB open.
That removes the ordering bug. It retains the current assumption that a
missing producer for an established local Node is sufficient evidence to
retire the copy, which can also happen if only the owning Chain was lost.
I would use the explicit clean transition for the stronger whole-System
guarantee. A different history ID alone can also result from switching
local workspaces. Only a transition tied to the remembered history proves
that the operator authorized replacing it. Reuse the current snapshot and
discovery calls where possible. The CLI must bind the clean transition to
the fresh System history it actually starts. Capture the old and new IDs
before clearing the old storage, then make the transition usable only
when that new System accepts the spec. A clean that fails halfway needs
an idempotent retry. A partial owner reset or a rollback to an older
backup needs explicit handling at the authority. A matching ID by itself
cannot validate a checkpoint against a rolled-back history.

### 3. Reduce the amount of data that needs migrations

A confirmed view recoverable from a validated authoritative snapshot is a
cache. The browser's only surviving copy of a pending original is durable
work. Build around a small, stable outbox representation for originals,
their exact identity and contract binding, and enough acknowledgement or
outcome evidence to resume the same producer. Preserve command IDs,
positions and recorded outcomes during recovery. Changing the chosen
contract or release can require the old reader or a drain while that
binding still exists. A new lock can select a fresh Node while the prior
binding's pending work remains discoverable for the same verified
account and System. Keep that discovery independent of opening the old
Node. Treat the old payload and its binding as immutable. Park any untranslatable work explicitly, with a
recovery or export path. Never restage uncertain originals under new IDs.

Key or rebuild derived state independently when the cache layout changes.
Require completed cache publication at a known authoritative checkpoint.
Make the split logical first. Keep a single transaction where originals,
progress and resources require atomicity today. A physical split only earns
its keep when publication is restartable from one durable owner plus a
versioned cache. SQLite's cross-file guarantees depend on the journal mode.
The current tab journal also swallows persistence failures. A future
promise that an offline change has been saved requires successful durable
retention before presenting that promise.
[Node command ownership][commands] · [Current tab journal][journal] ·
[Replicache rebase][replicache] · [SQLite attached-database transactions][attach]

## Verification that would buy confidence

1. **Release drift.** Gate publication on the previous real artifact and
   supported older artifacts with substantive data. The 48.0.0 file at
   layout 24 must produce an explicit upgrade or a release rejection. A
   fresh 48.0.1 file exercises the distinct baseline. Add a case for equal
   SQL with different command representation.
2. **Clean with an unreadable old file.** Give a real connected browser a
   supported earlier namespace plus an incompatible local ledger, stage
   work, and deliberately clean the authorized test System. A new
   authenticated history reaches readiness without opening the obsolete
   SQLite file. No old originals reach the new Chain. Verify an old tab,
   an in-flight admission and an interruption between fencing and opening.
3. **Preservation.** Ordinary restart, offline and auth failure, or a
   different or unproven backend preserve the old namespace and work. Same
   System and supported format changes retain originals exactly once,
   including a lost admission response. An incompatible authored binding
   shows which work is blocked and preserves it. Cache reconstruction must
   never drop the only local copy of an original.

Start with the release gate and the early authenticated clean path. A
narrower durable outbox reduces future migration burden, but it is a
separate design change. No runtime or browser data was changed in this
research.

[adr]: ../adrs/027-connected-browser-node-storage-upgrades.md
[attach]: https://sqlite.org/lang_attach.html
[commands]: ../adrs/003-immutable-node-command-history-and-submission-order.md
[cutover]: https://github.com/morgs32/zerospin/commit/65b35f643454225c0d294ebc5016bf729171ffc6
[dependency]: https://github.com/morgs32/zerospin/blob/c55222cafa0630a34e57f716462edd7b7bdac1fe/packages/core/src/AggregateNode/AggregateNode.ts#L966-L1012
[definition]: ../../packages/browser/src/AggregateNode/makeAggregateNodeDefinition.ts
[discovery]: ../../packages/browser/src/AggregateNode/aggregateSessionDiscovery.ts
[history]: ../../packages/core/src/Node/nodeMigrationHistory.ts
[journal]: ../../packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts
[ledger]: ../../packages/core/src/Node/nodeMigrationLedger.ts
[liquibase]: https://docs.liquibase.com/secure/reference-guide-5-1/changelog-attributes/runonchange
[old-layout]: https://github.com/morgs32/zerospin/blob/c55222cafa0630a34e57f716462edd7b7bdac1fe/packages/core/src/AggregateNode/storage/aggregateNodeStorageV24.ts
[producer]: ../../packages/browser/src/AggregateNode/makeAggregateWorkerRuntime.ts#L939-L970
[replicache]: https://doc.replicache.dev/concepts/how-it-works
[reset-plan]: ../archive/plans/308-plan-local-reset-browser-recovery.md
[resolution]: ../../packages/browser/src/AggregateNode/resolveAggregateNode.ts
[room]: https://developer.android.com/training/data-storage/room/migrating-db-versions#test-all
[schema]: ../../packages/core/src/Node/validateNodeStorageSchema.ts
[sqlite-version]: https://sqlite.org/pragma.html#pragma_user_version
[timelines]: https://www.postgresql.org/docs/current/continuous-archiving.html#BACKUP-TIMELINES
[transactions]: https://sqlite.org/lang_transaction.html
