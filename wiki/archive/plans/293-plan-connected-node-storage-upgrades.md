# 293 — Connected Node storage upgrades

**Status:** Completed 2026-11-05 — implementation and scoped verification complete.
**Scope:** Connected browser AggregateNode and ServiceNode framework storage.
**Baseline:** Current Node SQL layout 22 and the approved connected-storage exception in `AGENTS.md`.

## Problem and agreed behavior

1. New client/runtime code must be able to finish delivery of commands retained under a supported older Node SQL layout, migrate that physical representation forward, and resume ordinary staging under the current layout without losing or re-authoring commands.
2. Begin with a **new migration-aware baseline**. Do not adopt, scan, copy, rename, reset, or delete the existing runtime-hash databases or their discovery records. First consumer adoption requires separately retiring pre-baseline runtimes and draining their pending work. Automatic legacy adoption is outside this plan.
3. Support unchanged exact authored session bindings only: API/System scope, owner and Actor versions, complete claims, session name, and session lock must continue to identify the same `sessionKey`. Model/contract/Actor changes, command-wire changes, and moving commands between identities are separate work.
4. Keep migration automatic inside session initialization. Constructors, managed hooks, session definitions, backend snapshot/ticket interfaces, and application update notifications gain no author-facing migration options or callbacks. QRK and HTTP service workers do not orchestrate Node storage upgrades.
5. Downloaded executable resources may change independently. A compatible runtime with the same supported SQL layout reopens retained storage normally, including eligible offline startup. An actual pending SQL upgrade fences new staging, drains the old backlog, migrates locally, and publishes readiness only afterward.
6. Preserve explicit `pushPaused`. It blocks an upgrade that needs network delivery; it does not block a wholly local upgrade when every retained original already has its final. Never silently resume a paused producer. Retry alone cannot clear persisted pause: the failure must direct an operator to resume pushing through a still-supported, migration-aware older executable before retrying and then close that owner. If no compatible executable is available, remain blocked; do not add a pre-readiness pause-control API or reset the flag. Supplying an older client artifact is a consumer rollout responsibility.

## Decisions and invariants

1. **Stable persistence, versioned executables.** Connected physical names become `/zerospin/aggregate/${sessionKey}` and `/zerospin/service/${sessionKey}`. Discovery databases become `zerospin:aggregate:discovery` and `zerospin:service:discovery`. Preserve their current exact identity codecs, eligibility/revocation rules and revision fencing. Keep `sharedWorkerVersion` in executable routing/handshake and exact-artifact checks, not persistence or lease identity. Old pre-baseline code does not know these new physical names.
2. **One physical owner.** Use the existing namespace lifetime lease for the entire inspection, journal import, drain, migration and live Node lifetime. Wait for an older live owner using existing cancellable acquisition and preparation deadlines; do not force-close tabs, steal locks, or release exclusion after uncertain cleanup. Future migration-aware executables must refuse newer storage without resetting it. Distinct runtime executables are serialized even when their SQL layouts are compatible: a tab that accepts an update may wait or time out while another old-runtime tab remains open. Same-executable tabs continue sharing their normal Node; automatic cross-version takeover is outside scope.
3. **Two independent version facts.** `PRAGMA user_version` identifies the Node physical layout; the new baseline remains layout 22. An owner-local `applied_migrations(migrationId, definitionChecksum)` ledger records baseline 0 and the immutable ordered forward history. It does not change command or model versions. Provision the fresh layout, producer metadata, resource tables, version stamp and baseline ledger in one transaction. Do not fabricate a production ALTER edge simply to demonstrate migration.
4. **Explicit forward edges.** Each family owns its immutable migration definitions: increasing positive `id`, nonempty `name`, exact `fromVersion`, `toVersion`, and ordered SQL statements. Bind the checksum to the exact tuple `[id, name, fromVersion, toVersion, sql]`; compute hashes outside SQL transactions. Validate that stored history is a complete supported prefix and that version stamps agree with that prefix. Baseline 0 has a fixed declared checksum; validate the physical graph separately rather than treating that checksum as a schema fingerprint.
5. **Historical storage operations, current transport.** Keep a concrete layout-22 storage implementation for each family. Ordinary Nodes and pre-upgrade drains use the same defining SQL/row-codec procedures. Narrow the existing synchronizers' internal dependencies to the operations they already call; do not clone whole Node classes, load old application bundles, add a generic version-injected public constructor, or create another network protocol. Each future physical-layout change must ship its corresponding supported historical drain implementation and graph description.
6. **Unchanged authored logic.** The current executable already contains the correct model codecs for the unchanged session lock. Retain final commands and apply their exposed deltas through those codecs while draining. Never advance a materialization checkpoint without committing the corresponding resource changes. Do not use `applyDelta: false` as a shortcut to certify a drained Node.
7. **Finalization barrier.** First import successfully persisted matching tab journals. Then capture the producer's immutable `pushIndex` while new staging is fenced. Finish only when contiguous `outcomeIndex` reaches that position. An empty `nextPush()` or `admittedThroughPushIndex` proves less and is insufficient. Success and authoritative execution-refusal finals both close a position; admission refusal or unavailable authentication does not. Later external operations need not finish.
8. **Immutable commands and history.** Preserve `nodeId`, command IDs, `sessionId/sessionIndex`, `nodeIndex/pushIndex`, original payloads/claims/staging outcomes, contract bindings, retained finals, resource checkpoints and pause state. The log is not physically emptied. Migrations change representation, not command intent, command-derived model facts or producer identity. Do not add a parallel canonical-command JSON/blob backup.
9. **Forward recovery, not downgrade.** A failed local migration rolls back that transaction. A later failure preserves earlier committed migration steps. Retry resumes from the validated committed prefix; there are no automatic down migrations, fresh-producer replacements, namespace rotation or storage resets for upgrade failures.

## Lifecycle and implementation steps

1. **Establish the connected-only baseline.** Add the stable physical/discovery naming and ledger provisioning together. Keep Aggregate standalone, Native hosts, mocks, Agent observers and their existing storage policies unchanged. AggregateNode's initializer is shared with other hosts: do not silently enable migration there for every caller. Use an explicit internal connected-browser storage initialization path, retaining the existing entrypoint for other hosts; it is not an application API.
2. **Implement owner-local history and schema checks.** Put format-independent ledger preparation/checksum/prefix checks in core Node storage code and concrete family histories beside their Node tables. Use the asynchronous Node SQL gate for database work. Reuse the existing declared schema graph and table-comparison rules through an asynchronous metadata reader; do not import Durable Object adapters or copy a second set of schema-validation semantics. Reject unknown tables/views/triggers, malformed metadata, unsupported formats and history drift without repair. Reserve `applied_migrations` in the migration-aware connected owner and reject a colliding authored model before any provisioning; do not broaden standalone/Native table-name restrictions merely to reserve this browser ledger.
3. **Create the historical drain seam.** Extract the current layout-22 row access, original reconstruction, admission progress, final/resource transaction and checkpoint reads into the family-owned version modules. Ordinary Node methods delegate to those defining operations. Reuse `AggregateNodeSynchronization` and `ServiceNodeSynchronization` for credentials, retained-Node snapshot recovery, tickets, replay, push and acknowledgements. Their existing dependency comprises `authenticated`, `rejectAuthentication`, `connectionState`, `status`, `snapshot`, `nextPush`, `admitted`, `reconcileAdmission`, `admissionRejected`, and `receiveCommand`; keep Aggregate and Service shapes explicit and internal.
4. **Recover the tab-to-Node gap before freezing.** Existing `makeStagedCommandJournal` keys already use family, `sessionKey`, `nodeId`, `sessionId` and `sessionIndex`, independently of the runtime hash. Preserve that wire format. Add a strict paged read for upgrade preflight using the existing command schemas. Snapshot matching keys and values once, then page that immutable snapshot; never page mutable `localStorage` numeric offsets while deleting acknowledged keys. Matching malformed/unsupported/inaccessible entries must block preflight and retain their bytes; the current forgiving recovery read cannot certify completeness. Unrelated identities and Node IDs are outside the read.
5. **Wire an internal initialization callback.** Extend the existing page/SharedWorker attachment capability with a journal-bootstrap callback, owned and released like the current credential callback. After existing online authentication or eligible exact remembered-identity resolution, and source-node validation, send the same verified identity facts that currently fence the first view. The page performs its existing full identity/expected-claims checks before reading matching journals; the receiving worker strictly validates each original again at its ingress. Recover all matching sessions for this producer, retain originals idempotently with their original submission identities, and remove journal entries only after durable Node retention acknowledgement. Completion means every entry in the stable scan has exact durable Node retention coverage; best-effort deletion can leave acknowledged keys behind for later idempotent cleanup. Do not use physical key emptiness or the failure-suppressing ordinary `recoverStagedCommands.drain` as the bootstrap barrier. A failed/dropped callback or a matching record that cannot be read and validated aborts preflight. This adds no browser/server authentication shortcut and no author-facing callback. Preserve the existing best-effort journal-write contract: preflight can recover successfully persisted records, but cannot reconstruct an original whose browser storage write never succeeded; this plan does not introduce a new durability guarantee for those writes.
6. **Fence, import, then drain.** Keep attachment readiness withdrawn and expose no current-layout replica or command capability. The physical lease excludes older owners; initialization guards prevent new callers from staging. After every original in the stable journal scan has durable Node retention coverage, capture `pushIndex`, respect pause, and run old-format synchronization until the contiguous final prefix reaches it. Keep normal selected-delta/checkpoint validation and retention. The initial baseline supports unchanged bindings and unchanged encoded-command journal formats; it does not promise upgrades across future journal/wire codec changes.
7. **Stop network work before SQL migration.** Stop and join the provisional synchronizer and its callbacks, retaining storage ownership. For each pending edge, run its SQL, write its schema stamp and ledger row, and validate the declared destination graph/history in one `BEGIN IMMEDIATE` transaction. Commit each edge before the next. Do not hold that SQL transaction across credentials, socket traffic or remote execution. Reopen the current-format Node only after the full supported history and final graph validate.
8. **Resume normal attachment.** Reconstruct optimism from retained command-derived state using the current format and same binding; then publish the first validated view and readiness through the existing lifecycle. Continue ordinary journal recovery idempotently after attachment. Compatible no-upgrade startup must not incur an unnecessary network drain or an extra authenticated snapshot solely for migration.
9. **Contain failures before generic recovery.** Put preflight ahead of the current `node.initialize()` failure paths that can recreate storage. Audit both startup and synchronization-repair paths, including `readConnectedRecoveryMetadata`. Add bounded, schema-backed upgrade failures to existing browser error handling: unsupported/newer format, missing/invalid ledger, blocked pause, journal-bootstrap failure, migration failure and graph mismatch. Preserve existing authentication/network/timeout errors while marking the upgrade attempt as non-resettable. No exception thrown inside preflight may fall through to generic reset/fresh-producer recovery.
10. **Interruption and offline behavior.** Follow the attachment AbortSignal and existing credential/snapshot/ticket/preparation budgets; add no polling loop or global update timer. Cancellation stops new work, joins in-flight SQL/network callbacks and closes handles before lease release. A missing backend or authentication rejection preserves all originals and the current physical layout. An eligible remembered identity with no unresolved originals may complete a purely local upgrade offline. A pending backlog cannot migrate until online finalization succeeds. Surface failure through existing initialization error/Retry, with no readiness or background reset. Successful preservation is silent.

## Annotated examples

1. Representative upgrade with pending work:

```text
# 1. A migration-aware layout-22 producer retained originals 1..8.
# 2. Final evidence covers 1..6; a closed tab's journal contains another original.
Strict journal import -> retain that original with its original session identity
Freeze the resulting producer prefix -> authenticate and finalize that full prefix
Stop/join synchronization -> commit the declared forward SQL edge and ledger stamp
Open current layout -> publish readiness -> newly staged commands continue this producer
```

2. A stored execution rejection counts as final evidence. A rejected admission, offline socket, paused push or a merely successful push response does not substitute for the contiguous final prefix.
3. Illustrative orchestration only; these names describe the internal phases, not new author APIs:

```ts
// 1. Lease ownership and identity validation already hold; no session is ready.
await recoverPersistedStagedCommands();
const throughPushIndex = await readStoredPushIndex();
// 2. Preserve normal final/resource transactions while completing the frozen prefix.
await drainSupportedStoredLayout(throughPushIndex);
await stopAndJoinSynchronization();
// 3. Only local SQL and its ledger stamp are inside each migration transaction.
await applyPendingForwardMigrations();
// 4. Publish only after opening and validating the current format.
await openCurrentLayoutAndPublishReadiness();
```

4. The first production migration list is empty after baseline 0. Existing tests declare a real inline later SQL edge and destination graph to exercise migration; do not add a purposeless production schema change or a public test-only version override.

## Implemented file hierarchy

Legend: `+` create; `~` modify. Root: `zerospin/`. Existing verification files were extended; no test files, fixture files, runners, configuration, compatibility barrels or whole-runtime copies were added.

```text
zerospin/
├── fragment/
│   └── content/
│       ├── handbook/
│       │   └── ~ versioning-and-deployment.md
│       └── reference/
│           └── ~ browser.md
├── packages/
│   ├── browser/
│   │   ├── skills/
│   │   │   └── zerospin-browser-sessions/
│   │   │       ├── ~ SKILL.md
│   │   │       └── references/
│   │   │           └── ~ instance-inputs-and-worker.md
│   │   ├── src/
│   │   │   ├── AggregateNode/
│   │   │   │   ├── ~ AggregateNodeSynchronization.ts
│   │   │   │   ├── ~ AggregateSharedWorkerApi.ts
│   │   │   │   ├── ~ aggregateSessionDiscovery.ts
│   │   │   │   ├── attach/
│   │   │   │   │   └── ~ attach.ts
│   │   │   │   ├── ~ makeAggregateSharedWorker.ts
│   │   │   │   ├── ~ makeAggregateWorkerRuntime.ts
│   │   │   │   ├── ~ makeConnectedAggregateConnection.ts
│   │   │   │   └── + prepareAggregateNodeStorage.ts
│   │   │   ├── Node/
│   │   │   │   ├── ~ NodeErrors.ts
│   │   │   │   ├── ~ nodeRpcErrorFor.ts
│   │   │   │   ├── ~ nodeStorageNamespaces.ts
│   │   │   │   ├── ~ publicRpcError.ts
│   │   │   │   └── ~ shouldResetConnectedNode.ts
│   │   │   ├── ServiceNode/
│   │   │   │   ├── ~ ServiceNodeSynchronization.ts
│   │   │   │   ├── ~ ServiceSharedWorkerApi.ts
│   │   │   │   ├── attach/
│   │   │   │   │   └── ~ attach.ts
│   │   │   │   ├── ~ makeConnectedServiceConnection.ts
│   │   │   │   ├── ~ makeServiceSharedWorker.ts
│   │   │   │   ├── ~ makeServiceWorkerRuntime.ts
│   │   │   │   ├── + prepareServiceNodeStorage.ts
│   │   │   │   └── ~ serviceSessionDiscovery.ts
│   │   │   └── stagedCommandJournal/
│   │   │       └── ~ makeStagedCommandJournal.ts
│   │   └── tests/
│   │       ├── ~ aggregate-host.browser.ts
│   │       ├── ~ node-network-errors.spec.ts
│   │       └── ~ service-host.browser.ts
│   └── core/
│       ├── src/
│       │   ├── AggregateNode/
│       │   │   ├── ~ AggregateNode.ts
│       │   │   ├── ~ aggregateNodeTables.ts
│       │   │   └── storage/
│       │   │       ├── + aggregateNodeStorageMigrations.ts
│       │   │       └── + aggregateNodeStorageV22.ts
│       │   ├── Node/
│       │   │   ├── + nodeMigrationHistory.ts
│       │   │   ├── + nodeMigrationLedger.ts
│       │   │   ├── + nodeStorageUpgradeError.ts
│       │   │   └── + validateNodeStorageSchema.ts
│       │   ├── ServiceNode/
│       │   │   ├── ~ ServiceNode.ts
│       │   │   ├── ~ serviceNodeTables.ts
│       │   │   └── storage/
│       │   │       ├── + serviceNodeStorageMigrations.ts
│       │   │       └── + serviceNodeStorageV22.ts
│       │   └── drizzle/
│       │       └── provisionDb/
│       │           └── ~ validateTableSchema.ts
│       └── tests/
│           └── ~ node-history-recovery.spec.ts
└── wiki/
    ├── adrs/
    │   ├── ~ 003-immutable-node-command-history-and-submission-order.md
    │   └── + 027-connected-browser-node-storage-upgrades.md
    ├── architecture/
    │   └── browser/
    │       ├── ~ AggregateCommandLifecycle.md
    │       └── ~ bootstrapBrowserSession.md
    ├── archive/
    │   └── plans/
    │       └── + 293-plan-connected-node-storage-upgrades.md
    └── ~ glossary.md
```

## Verification and acceptance

1. Extend existing test files only. Do not create test files, fixture files, runners or configuration; declare representative migration histories and failure injection inline. Use current `makeFn`/transaction tracing, direct domain results and receiver-owned validation conventions. Never verify Explorer.
2. In existing real-SQLite Node tests, prove fresh connected baseline provisioning is atomic, compatible reopen preserves producer/history, and standalone/nonbrowser initialization is unchanged. Exercise an inline forward SQL edge with actual retained originals and finals, including both command families, success and execution-refusal finalization, unhanded journal import and deduplication. Verify command identities, resource checkpoint/delta consistency, ledger/version and subsequent ordinary command allocation after upgrade.
3. Prove admission without final evidence cannot migrate; an explicit pause with pending work blocks; malformed/inaccessible matching journal entries cannot be skipped; deletion failure cannot loop or invalidate already durable coverage; paged import cannot skip keys as earlier pages are acknowledged; unrelated identity/producer journals remain untouched. Strict journal import must precede the frozen prefix and readiness.
4. Inject interruption after remote commit but before local final retention, during SQL before commit, and between two committed edges. Retry must preserve exact producer coordinates, avoid duplicate canonical work, roll back only the interrupted local transaction and resume from the actual ledger prefix. Include a close/cancel case that proves exclusion outlives in-flight writes.
5. Refuse changed checksums, missing ledgers on nonempty stable storage, unsupported/newer layouts, exact binding mismatch, and final graph drift. Assert that neither startup nor synchronization repair recreates storage for these failures. Preserve authentication failures and offline pending queues; permit eligible offline local upgrade when the prefix is already final.
6. Extend existing Aggregate/Service host browser scenarios to prove two migration-aware runtime versions contend on the same physical lease, older open tabs are not force-closed, later older-code reopening refuses a newer format without reset, and a closed tab's surviving journal is imported before migration. Use existing opt-in simulated backend and test worker entries; add no production test knobs. Do not claim server-side cutover/real-provider coverage from these scenarios.
7. Run one scoped Nx graph for core/browser `lib`, `lint` and `tsc:typecheck`, plus browser's additional `ts` check. Run root `zerospin:test` scoped to the listed existing spec files, preserving its test typecheck prerequisite. Confirm resolved project configuration before execution. Use the repository's existing documented Portless example origins for browser scenarios; do not repeat historical raw-port verification URLs or create a fresh origin/server. If the existing host cannot run a required scenario, record that concrete verification blocker rather than inventing a replacement harness.
8. Upstream Intent's executable is currently missing. Do not download a replacement. QRK's installed browser-session/parallel-model guidance informed planning; implementation must report the missing upstream dependency and use the repository's documented dependency setup only when separately available/authorized.

## First adoption, exclusions and documentation

1. First adoption is a deliberate cutover to the new stable baseline, not an automatic upgrade from pre-baseline storage. Before consumer adoption, use the still-compatible old runtime to finish pending work and retire its open documents/SharedWorkers. Local-only commands in old namespaces are not transferred. Leave those stores, keys, accounts and unrelated work intact. Consumer adoption must not proceed on an assumption that old work was drained; if that prerequisite cannot be established, stop adoption and design legacy recovery separately.
2. This plan excludes prerelease backports, arbitrary historical schemas before the new baseline, legacy namespace adoption/merging, altered authored locks or command-wire formats, standalone/Native migration support, HTTP service-worker/cache redesign, backend schema/registry changes, application UI, package publication, deployment, QRK dependency adoption and storage resets.
3. After implementation, reconcile Fragment usage and browser architecture workflows with measured behavior, including startup/retry, strict journal bootstrap, online requirements, pause behavior and runtime-vs-storage identity. Update the existing glossary's relevant Node/schema/migration entries and browser-session skill guidance. Do not perform that documentation reconciliation while merely planning.
4. Record the implemented stable-storage/forward-upgrade trade-off in a successor ADR only after it meets the hard-to-reverse, surprising-without-context and real-trade-off criteria. It qualifies if implemented as designed. Allocate its number then, link it from this plan, and amend ADR 003's connected identity paragraph to reference it while retaining ADR 003's still-governing command-history invariants. Do not retire the whole ADR just because its storage-identity clause changed.
5. Follow `implement` for actual execution and evidence. Archive this plan under the same filename only when implementation, required verification and post-implementation documentation are complete.

## Source references

1. [Current connected namespace selection](../../../packages/browser/src/Node/nodeStorageNamespaces.ts), [Aggregate discovery](../../../packages/browser/src/AggregateNode/aggregateSessionDiscovery.ts) and [Service discovery](../../../packages/browser/src/ServiceNode/serviceSessionDiscovery.ts).
2. [Node SQL gate](../../../packages/core/src/Node/makeNodeSqlGate.ts), [storage-owner teardown](../../../packages/browser/src/Node/closeNodeStorageOwner.ts) and [reset classification](../../../packages/browser/src/Node/shouldResetConnectedNode.ts).
3. [Immutable command/producer invariants](../../adrs/003-immutable-node-command-history-and-submission-order.md), [Aggregate original reconstruction](../../../packages/core/src/AggregateNode/readAggregateNodeRecord.ts) and [Service original reconstruction](../../../packages/core/src/ServiceNode/readServiceNodeRecord.ts).
4. [Existing tab journals](../../../packages/browser/src/stagedCommandJournal/makeStagedCommandJournal.ts), [post-attachment recovery](../../../packages/browser/src/stagedCommandJournal/recoverStagedCommands.ts) and [Aggregate replica startup](../../../packages/browser/src/sessionReplica/openAggregateSessionReplica.ts).
5. [Existing migration convention](../../patterns/system-worker/repo-lifecycle.md), [DO ledger implementation](../../../packages/system-worker/src/makeMigratableDORepo/migrationHistory.ts) and [transactional migration application](../../../packages/system-worker/src/makeMigratableDORepo/applyMigratableDORepoMigrationTx.ts). These supply conventions, not directly reusable Cloudflare/browser adapters.
6. [Prior connected discovery plan](284-plan-worker-owned-connected-session-discovery.md) and [versioning guidance](../../../docs/content/handbook/versioning-and-deployment.md). The archived discovery plan records its historical runtime-hash policy; the current policy is documented in Fragment and ADR 027.

## Implementation and verification evidence

1. Implemented on `codex/connected-node-storage-upgrades`: stable connected namespaces/discovery; atomic layout-22 baseline ledger; immutable forward history and concrete historical SQL operations; strict journal bootstrap; final-prefix drainage; transactional forward migration; current-format readiness; non-reset upgrade failures. Standalone/Native initialization and all registry selections remain unchanged. [ADR 027](../../adrs/027-connected-browser-node-storage-upgrades.md) records the implemented storage commitment while ADR 003 retains its command-history rules.
2. Final focused `pnpm nx run zerospin:test -- ...` passed **7 files / 42 tests**, including its dependency builds and `tsc -p tsconfig.tests.json`. Files: `node-history-recovery`, `node-final-before-reply`, `node-view-recovery`, `node-network-errors`, `node-subscriber-disposal`, `aggregate-replica-lifetime`, and `service-replica-lifetime`. Existing real-SQLite cases cover both connected families, baseline transaction rollback, producer/history/resource preservation, finalization rather than admission, local migration rollback and committed-prefix retry, checksum/missing-ledger/newer-format refusal, exact binding mismatch and physical graph drift. This is scoped verification, not a full-repository suite claim.
3. Core/browser `lib`, `lint`, and browser `ts` passed through Nx. Final core lint has **0 errors / 18 pre-existing warnings** outside the changed implementation; browser lint has zero errors/warnings. The two inferred package `tsc:typecheck` targets passed against fresh outputs with `--excludeTaskDependencies --nxIgnoreCycles --skipSync --parallel=1`. The ordinary inferred graph has an existing core/system-worker/browser dependency cycle and out-of-sync inferred project references; no Nx configuration or reference synchronization was changed. Nx Cloud artifact upload returned a nonfatal 401; local checks completed.
4. Actual browser verification used only the configured `https://tic-tac-toe.zerospin.localhost` origin, existing host exports/worker entries, SQLite/IndexedDB, localStorage, Web Locks and the existing simulated backend. Each family passed six cases: finalize/import/migrate/resume; preserved explicit pause; offline backlog refusal; idle offline upgrade; admission-only cancellation without migration; and malformed journal preservation. Successful cases froze through push 2, migrated after outcome 2 and finalized ordinary command 3 with checkpoint/resource amount 3 and the same producer.
5. Shared-mechanism browser checks additionally passed: immutable journal pages `[100, 4]` with repeated acknowledgements and an already retained duplicate (105 total originals, no skipped entry); two remotely finalized commands interrupted at local `outcomeIndex: 0`, then replayed twice each before one migration and command 3 (exactly 3 remote commits for 3 originals); and cancellation with an actual SQLite transaction open during upgrade journal retention. The latter preserved layout 22, Node ID and the unacknowledged journal, and the competing physical lease remained pending until rollback, Node drainage and owner close finished.
6. Actual Aggregate and Service SharedWorker startup checks each serialized two distinct executable artifact URLs on the same physical namespace. The first attachment continued retaining a command while the second waited; after its close, the second reopened the same producer and continued the original sequence. Both hosts also refused a fixture stamped `user_version = 2147483646` with `node-storage-upgrade-newer`, preserving the stamp and Node ID. These are independent artifacts of the migration-aware baseline, not two published package releases.
7. Production migration lists remain empty after baseline 0. Forward-edge evidence uses inline SQL histories in existing SQLite tests and a test-local edge in existing browser helpers; no purposeless production layout 23 or public test version override was introduced. Browser evidence establishes local upgrade/protocol/ownership behavior with simulated authority, not real-provider, server deployment, consumer cutover or published-release coverage.
8. Reconciled Fragment handbook/reference, browser-session skill/reference, glossary, ADRs and the two affected architecture workflows. Final formatting/whitespace checks passed; all 508 local links/routes/source ranges across 10 changed documents resolve, and all 80 architecture source hashes match the current source. The plan hierarchy reflects actual changed files; plan-relative and inbound links are repaired on archival.
9. Upstream's installed Intent executable is unavailable; no replacement was downloaded. QRK's installed browser-session and parallel-model skills supplied the matching guidance. Explorer and Shopping browser verification were not performed, as required by their repository instructions.
10. An intermediate verification run collided on shared build outputs; it was rerun alone. A subsequent test typecheck found a test-helper Drizzle API mismatch, which was corrected before the final successful run and browser cancellation check. No dependency publication, deployment, consumer adoption, canonical registry change, pre-baseline namespace adoption or existing-storage reset occurred. First adoption still requires the separately authorized old-runtime drainage/retirement described above.

## Remaining work

None.
