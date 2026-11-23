# 116 — Node command journal and owned subscriptions

1. **Implementation status:** implemented and verified in the approved goal on 2026-10-11.

2. **Current evidence and concrete problem**
   1. [AggregateNode](/Users/morgs32/GitHub/zerospin/packages/core/src/AggregateNode/AggregateNode.ts:624) and [ServiceNode](/Users/morgs32/GitHub/zerospin/packages/core/src/ServiceNode/ServiceNode.ts:564) return retained records for any repeated command ID before comparing immutable input or binding. A reused ID with a different payload can appear accepted locally. Server admission equality cannot repair this earlier local contract.
   2. Both classes combine async SQL serialization/transactions, original/final journal retention, resource deltas, producer progress, snapshot partitioning, subscriber pumps and transient authentication/connection status in 1,198/1,028 lines. Service final retention repeats the aggregate algorithm inline. This obscures the journal's atomic invariants.
   3. Subscriber pumps are detached `void Promise.resolve().then(...)` tasks. Their readiness promise and remote callbacks have no owning close barrier. Neither Node can fence new work and drain queued SQL before the browser/native owner closes its DB.
3. **Simpler owners**
   1. A family Node journal owns the immutable originals/final occurrences, declared resources, producer positions and authoritative checkpoint. Original retention, receipt prefix changes and final retention each have focused domain transaction procedures. Aggregate/service differences stay explicit in these procedures; shared SQL gate and subscription mechanics do not interpret domain wire data.
   2. One async SQL gate belongs to the database connection. It admits work until closing, serializes complete BEGIN/COMMIT/ROLLBACK transactions and exposes a drain barrier. Connected IndexedDB/sqlite-proxy SQL remains async; do not run this host driver through synchronous `makeTx` or hold a transaction across network/RPC callbacks. Local standalone execution remains inside the journal gate and its atomic command/resource transaction.
   3. One subscription owner captures/registers the snapshot and initial delivery boundary under the gate, then delivers outside SQL. It owns readiness, ordered page delivery, cancellation and reset epoch. Captured state/pages come from committed journal data. A canceled subscription prevents every subsequent read/publication and settles pending readiness immediately.
   4. Keep transient authentication, storage availability and connection state as distinct dimensions with one derived public status. Do not replace them with a duplicate generic state machine. Closing/closed gate admission returns the typed `node-closed` refusal; declare it alongside `node-command-input-conflict` and update RPC/native error unions. It is expected cancellation, not a persistence/checkpoint-conflict episode.
4. **Complete parent shapes**

   ```ts
   async function acceptAggregateOriginal(
     command: IAggregateNodeCommandInput,
     expectedNodeId?: string,
   ) {
     const result = await gate.transaction(async tx => {
       const identity = await readAggregateNodeIdentity(tx);
       if (expectedNodeId !== undefined && identity.nodeId !== expectedNodeId) {
         throw makeZerospinError('standalone-capability-stale');
       }
       const original = validateAggregateNodeOriginal(command, definition);
       const retained = await readAggregateOriginal(tx, original.id);
       if (retained !== null)
         return recoverAggregateOriginal(retained, original);
       await validateAggregateNodeAdmission(tx, original, expectedNodeId);
       return appendAggregateOriginal(tx, original);
     });
     if (result.appended) subscriptions.publishCommands();
     return result.records;
   }
   async function receiveAggregateFinal(command: IAggregateBrowserCommand) {
     const result = await gate.transaction(async tx => {
       const occurrence = validateAggregateFinal(command, definition);
       const retained = await readAggregateFinal(tx, occurrence);
       if (retained !== null)
         return recoverAggregateFinal(retained, occurrence);
       await validateAggregateContinuation(tx, occurrence);
       await applyAggregateSelectedDelta(tx, occurrence.delta);
       return appendAggregateFinalAndAdvanceProgress(tx, occurrence);
     });
     if (result.appended) subscriptions.publishCommands();
   }
   async function closeNode() {
     gate.preventNewWork();
     subscriptions.cancel();
     try {
       await subscriptions.drainLocalTasks();
     } finally {
       await gate.drain();
     }
   }
   ```

   1. These are syntactically valid schematic TypeScript parents. Service equivalents name service procedures and preserve its exact identity/projection model. The real Node class binds those procedures and status observation; a giant generic journal context replacing both classes is excluded.
   2. `validateAggregateNodeOriginal`/service equivalent normalize the supported encoded input once against the bound family schema; payload remains the original string. Current Node command input schemas reside in browser; move their canonical declaration into core so all browser/native/standalone callers use one schema and derived type. Unsupported envelope fields follow the same explicit normalization policy on fresh retention and retry. Schema normalization never changes payload bytes.
   3. `recoverAggregateOriginal`/service equivalent compare every immutable supported original field, including command name/version, payload, binding/provenance and staging evidence. Exact retries return original/final retained records without current guard/program execution or position allocation. Conflicts return a new typed `node-command-input-conflict`; add its actual error catalog declaration and update RPC/native result unions in the same cutover. A supplied standalone expected Node ID is checked before retry recovery so reset capabilities remain fenced.
   4. `appendAggregateOriginal` allocates Node/push positions, inserts original and advances both next positions atomically. No failed original consumes positions. Original retention remains permitted offline when the locally initialized identity is usable; actual auth rejection/sign-out/storage conflict blocks fresh work.
   5. Final procedures verify exact occurrence/ID equality, checkpoint continuation, selected resources and local original correlation before mutation; then append final, apply the selected delta and advance public/private progress together. Root [operation codec plan](108-plan-model-operation-codecs.md) owns resource/body validation; do not keep a separate Date-only decoder in Node. Duplicate exact finals are idempotent; conflicts/gaps block synchronization without partially changing resources.
   6. The canonical result-journal/cursor plan owns removal of redundant source/executed cursors and hashes across wire/storage. Apply that model here as a dependency, requiring empty fixed storage; no deprecated aliases remain. Preserve producer push/outcome positions as distinct from source occurrence and local Node delivery positions.
   7. `subscriptions.cancel()` closes leases and rejects unfinished initial readiness with the existing cancellation/detach category. Local await wrappers observe opaque RPC results but stop awaiting them on retirement. Late sink results cannot update a cursor, start SQL or publish. Drain joins owned local tasks and admitted SQL, not an indefinitely frozen remote tab. Repeated Node close returns the same promise; the host storage owner subsequently closes the DB.
   8. Reset rotates aggregate Node identity atomically and retires old delivery epochs. A pending old snapshot/page completion cannot advance the replacement cursor; every surviving subscriber receives the complete new snapshot before new pages. Service has no standalone reset and needs no unused reset policy.

5. **Removals and caller scope**
   1. Delete inline duplicate-final hashing/JSON roundtrips, repeated producer settlement loops and snapshot partition scans after named journal queries/procedures own them. Use encoded value equality directly rather than hash every comparison asynchronously. Preserve exact array order and nullable private finalization.
   2. Delete detached subscriber task launches and unowned `sending/wake/ready` state once one subscription owner owns those tasks. Do not delete the required snapshot/register atomic boundary or call external sinks inside it.
   3. Update browser worker runtime, authentication/synchronization, RPC command input adapters and native/standalone owners together. [111](111-plan-connected-worker-ownership.md) owns host namespace leases, attachments and transport attempts; this plan owns Node journal/quiescence. [113](113-plan-session-replica-bootstrap.md) consumes snapshots/pages; [117](117-plan-session-reconciliation-and-evaluation.md) owns tab/session optimism, not Node persistence.
6. **File hierarchy** (`+` create, `~` modify, `-` delete; rooted at `zerospin/`)
   ```text
   ~ packages/core/src/AggregateNode/AggregateNode.ts
   ~ packages/core/src/AggregateNode/aggregateNodeTables.ts
   + packages/core/src/AggregateNode/AggregateNodeCommandInputSchema.ts
   + packages/core/src/AggregateNode/acceptAggregateOriginalTx.ts
   + packages/core/src/AggregateNode/retainAggregateFinalTx.ts
   ~ packages/core/src/AggregateNode/types.ts
   ~ packages/core/src/ServiceNode/ServiceNode.ts
   ~ packages/core/src/ServiceNode/serviceNodeTables.ts
   + packages/core/src/ServiceNode/ServiceNodeCommandInputSchema.ts
   + packages/core/src/ServiceNode/acceptServiceOriginalTx.ts
   + packages/core/src/ServiceNode/retainServiceFinalTx.ts
   ~ packages/core/src/ServiceNode/types.ts
   + packages/core/src/Node/makeNodeSqlGate.ts
   + packages/core/src/Node/makeNodeSubscriptions.ts
   ~ packages/core/src/Node/validateNodeSnapshotReconciliation.ts
   - packages/browser/src/AggregateNode/AggregateNodeCommandInputSchema.ts
   - packages/browser/src/ServiceNode/ServiceNodeCommandInputSchema.ts
   ~ packages/browser/src/{AggregateNode,ServiceNode,StandaloneNode}/
   ~ packages/native/src/makeNativeSession.ts
   ~ packages/error/src/ [actual typed error declaration]
   ~ packages/core/src/{AggregateNode,ServiceNode}/README.md
   ```
7. **Ordered implementation and acceptance**
   1. Agree cursor/resource codec contracts with their canonical owners. Introduce the family input schemas and encoded original equality; update all callers and add the actual conflict error without compatibility exports.
   2. Extract focused family journal transaction procedures while preserving async host SQL and one gate. Simplify final retention and pending/receipt queries under exact original/final constraints; retain immutable history, not an overwritten command row.
   3. Introduce the owned subscription scheduler and quiescence barrier, then make browser/native/standalone storage close await it through Plan 111/114. Remove duplicated inline/Promise machinery.
   4. Exact retry returns the same original/final records and consumes no new index; differing payload, binding, provenance, version or immutable staging is rejected before journal mutation. Reset rejects saved old capabilities even for retained IDs.
   5. Snapshot plus registration covers every subsequent Node record exactly once in order, without a delivery gap. Close during opening snapshot, state/page read, frozen sink callback or standalone execution drains all accepted SQL; no later callback touches storage. Cleanup cannot wait indefinitely for a remote sink.
   6. Every final/resource/progress mutation commits or rolls back together. Private finalization remains undisclosed to unrelated recipients. Cursor schema changes require empty storage.
8. **Existing verification and lifecycle**
   1. Current core targets are `lib`, `lint`, `tsc:typecheck`, with no `ts`. Browser has `lib`, `ts`, `lint`; native uses real `build`, `ts`, `lint` after its existing graph repair. Recheck resolved metadata before execution. No permanent Node test/check suite exists and this review ran none.
   2. Reuse actual Node SQLite, snapshot, subscription, accept and standalone execute/reset APIs for collision/retry, rollback and drain evidence; actual worker/MessagePort/native host seams are required to prove frozen-tab/resource close and multi-owner behavior. Add no tests, fixtures, runners or their configuration. Record unavailable host evidence precisely.
   3. After implementation reconcile Node/session READMEs, linked architecture and the existing glossary. A changed immutable journal/storage model may qualify for an ADR; author/supersede one only after implementation and the normal tradeoff criteria. Archive after acceptance and required available verification complete.

## Verification evidence — 2026-10-11

Prior root-coordinated verification passed the fourteen-project library, TypeScript and lint graph with zero source warnings (`/tmp/zerospin-goal-quality-8.log`) and native, Shopping and Tic-tac-toe build/type/lint gates (`/tmp/zerospin-goal-consumers-5.log`). The actual core `tsc:typecheck` passed with `--skipSync` for existing Nx project-reference synchronization drift (`/tmp/zerospin-goal-core-typecheck-5.log`). Actual Swift package and iOS application builds passed (`/tmp/zerospin-goal-swift-3.log`, `/tmp/zerospin-goal-ios-build-3.log`). Those gates include the Plan109 native reopen repair and precede the final-command correlation repair below. Scoped journal/subscription/session source lint passed with zero warnings/errors.

Disposable actual SQL.js-backed async Node probes passed exact immutable retries/conflicts, original+final receipts, allocation stability, close fencing/idempotence, frozen-sink retirement and reset snapshot epochs. These are bounded Node evidence, not durable host acceptance.

Genuine two-Node Tic-tac-toe gameplay exposed an additional journal defect: after one Node retained its own pending move at `pushIndex` 1, receiving another Node's finals at aggregate indices 2/3 incorrectly advanced its private `outcomeIndex` from 0 to 1. The source/result journals and server snapshot still showed that pending Node's private prefix at 0; it never submitted the move. Drizzle had rendered the nested outer ID as unqualified `"id"`, so SQLite compared the inner final ID to itself. Evidence: `/tmp/zerospin-goal-107-118-tictactoe-play.log` and `/tmp/zerospin-goal-107-118-tictactoe-journal.log`.

The seven affected aggregate/service predicates now share [hasNodeCommandFinal](../../../packages/core/src/Node/hasNodeCommandFinal.ts), which renders explicit outer table/column identifiers from the actual public Drizzle journal table and columns. Bounded emitted-SQL assertions pass for aggregate/service pending snapshots, admission reconciliation and private completion prefixes, plus aggregate standalone draining: every query retains `executed."id" = "commands"."id"`. This repair changes no schema or owner fields.

Follow-up real SQL.js-backed Node API assertions passed for both families: a foreign final left two own submissions pending and private `outcomeIndex` at 0; completing the second submission did not skip the first; completing the first advanced the contiguous private prefix to 2 and cleared pending rows. Admission reconciliation succeeded when only a foreign final existed and refused an attempted rewind across a completed own submission with `node-admission-history-conflict`. Aggregate `executeNext`, the standalone drain path, consumed both own pending submissions in order despite the foreign final, then stopped at the empty journal. All 23 actually executed correlated statements retained explicit outer qualification. The inline invocation exited 0 using actual journal tables, SQL.js statements/adapters and Node procedures, without network requests or new files, runners, configuration or host bindings. These are bounded local journal checks, not authenticated service or durable-host acceptance.

The genuine gameplay rerun also passes the repaired foreign-result correlation. Two fresh actual Nodes independently authenticated and initialized from the retained game at public3. One submitted a mapped move, which finalized at4 and produced the configured computer's recorded child at5. Receiving those foreign finals left the other Node's exact original input pending, with admittedThroughPushIndex0 and outcomeIndex0 at public5. That Node then submitted its unchanged naturally stale move; the authoritative guard finalized it with `aggregate-guard-failed` at6 and no output. Its `admitted` and `receiveCommand` calls completed successfully, but an incorrect verification error-code assertion stopped before its terminal local metadata was sampled. No postfailure local-prefix measurement is claimed. Subsequent actual server snapshots reported each real producer's resolvedThrough1/public6; source/result journals, all six hashes and the unchanged selected graph persisted after owned shutdown. [Plan118](118-plan-version-result-owner.md) records the full evidence and exact bounds in `/tmp/zerospin-goal-118-rerun-{play,journal,physical,cleanup}.log`. No domain request was repeated or disposed pending history reconstructed. Worker/MessagePort/native interruption and storage-close cases remain unrun; the later normal mounted browser path is recorded below.

### Actual mounted journal and subscriber convergence — 2026-10-11

Two actual TicTacToe tabs at `http://127.0.0.1:53020/` used the same game `06538c4b-3fe5-44c4-9ef9-3e61b5a38e77` and retained producer `node_1fdsGFACy-lSB8DH5MM-Q`. Genuine moves from either live tab and backend computer continuations reached the same selected board. After closing only the second tab, the survivor progressed to `XOO.X....`; reopening the second tab displayed that graph, and the next move reached `XOO.X...X`/`X wins!`. Read-only source/result/selected-history rows retained six canonical occurrences, own push indices1–4, server private prefix4 and public6/hash `b9752804fa90a13212c937aa017b75483f66f57a0d27f82d87f1e3da6ef3f016`. The original create command remained in the retained journals as later commands arrived. These are actual normal connected command retention and subscriber convergence observations, separate from the prior direct SQL.js journal assertions.

New game `d2d47ddb-86f6-4fe7-be5a-3c7e56c9a082` in the second tab used independent producer `node_3O4Qh7bjNzMeQl6Kzl1vE`, own pushes1–2, server private2 and public3/hash `610500ccdada23900c757fd85d76fb1943e1bc9c3a479728ded77e3038b9c940`, with matching `O...X....` selected graph. The original tab stayed terminal. All nine result hashes independently derived from genesis; [Plan118](118-plan-version-result-owner.md) records exact counts and `/tmp/zerospin-goal-mounted-retry-browser-{baseline,private-baseline,independent-owners}.log` evidence. Browser-local journal/metadata and SQL-close ordering were not sampled. Ordinary tab closure/reopening does not establish a frozen sink, opening/read/execute interruption, full SharedWorker destruction, old reset-capability fencing or native storage closure.

The root-coordinated follow-up fourteen-project library/type/lint graph passed 46 tasks (`/tmp/zerospin-goal-node-correlation-quality-2.log`); actual core `tsc:typecheck` with `--skipSync` passed 4 tasks (`/tmp/zerospin-goal-node-correlation-typecheck.log`), and native/Shopping/Tic-tac-toe build/type/lint passed 25 tasks (`/tmp/zerospin-goal-node-correlation-consumers.log`). All three invocations exited 0. Those gates include the final-command correlation repair.

Module READMEs and source-linked architecture/glossary are reconciled. No permanent tests, fixtures, runners or configuration were added.

### Actual persistent native journal recovery — 2026-10-11

Actual native OS process close/reopen and an app update preserved winning original `cmd_KQiViojj-n3hZOYb2ctZZ`, exact input bytes, retained Node/session identities and push4/node9 while offline. The repaired shared connection owner automatically retried authentication about 3 seconds apart and, after backend restoration without manual retry/push/foreground, retained one final at public6/node10. The actual Node reached outcomeIndex4/admittedThroughPushIndex4; the session reached afterNode10 with zero optimistic operations and graph `XOO.X...X`. All prior nine local journal rows remained exact. A second native owner reached public3/private2 with `O...X....`, preserving all old winner rowsets. [Plan118](118-plan-version-result-owner.md#actual-native-offline-recovery-and-independent-owner--2026-10-11) records cursor/hash, host, local WAL and server evidence.

This establishes real persistent original retention, contiguous completion and normal subscription/projection convergence across native process reopening and transport unavailability. OS process termination does not establish an awaited Node close, admitted SQL drainage, frozen-sink retirement or capability disposal.

### Actual shared connection stop and Node read drainage — 2026-10-11

The production aggregate synchronization/authentication procedures used a real SQL.js-backed `AggregateNode`, the existing statement adapter and the actual retained native actor's first-party credentials/current session lock. The real initializer allocated `node_AtOn1zc5JYvt7wQOuAc9h`; its baseline was public6/hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049`, with private outcomeIndex0. Stopping while the genuine snapshot verification HTTP request was pending returned the same stop promise and drained local connection work in 4.32ms. The retired HTTP request later settled without changing the exact Node identity, metadata, resources or original/final partitions; no retry occurred across the following 3.2 seconds. Two subsequent real authentication/ticket/WebSocket connections reached online while preserving the same Node, cursor/hash, private prefix and resource rows.

After the final synchronization stop, a snapshot admitted before `node.close()` completed with the exact retained snapshot. Repeated close returned the same promise; a subsequent snapshot failed with the sole typed `node-closed` refusal. The actual SQL.js database closed only after Node drainage. `/tmp/zerospin-goal-111-headless-connection-lifecycle.log` records all four phases and `PASS`. These are bounded production transport retirement and accepted local read-drain checks, using real SQL and network responses without new files, fixtures, runners or fabricated provider responses. They do not establish Worker/MessagePort retirement, IndexedDB/WebLock or native file closure, frozen SQL drainage or an opaque frozen remote sink.

### Actual core same-database reopen and actor identity refusal — 2026-10-11

A separate real SQL.js Node used today's captured node-less actor snapshot at public6/hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049` and the current first-party session declaration/definition factory. Initialization generated `node_f_ZXgUsnO0mOIxEj1eg4D` and installed the real selected winner with private outcomeIndex0. After this owner closed, a second `AggregateNode` over the same database returned `false` from `initialize(false)` and retained the exact full snapshot, Node ID, metadata, resources, schema, user version and all table rows. The saved closed object still refused `snapshot()` with `node-closed` after reopening.

Using the other genuinely retained native actor's claims (`acct_b1e0a64243904ae99608d9df670ae064` / `gam_b1e0a64243904ae99608d9df670ae064`), the same definition factory produced a distinct owner whose `initialize(false)` failed with `node-storage-identity-mismatch`. Its attempt and close left the complete schema and tables exact. `/tmp/zerospin-goal-116-real-same-db-reopen.log` records both phases and `PASS`; the inline invocation exited 0 without a backend request, new declaration, fixture or runner. Both original/final command partitions were empty in this captured baseline. This proves bounded core same-database reopening and closed-object fencing, not reset-capability fencing, nonempty journal recovery, host storage reopening or namespace lock behavior.

### Authorized nonempty journal and controlled local drainage — 2026-10-11

`/tmp/zerospin-framework-goal-data-core-UAv4C2/node-lifetimes.mjs` uses the production AggregateNode, real SQL.js statements/Drizzle adapter and the captured genuine TicTacToe declaration, snapshot and immutable original/final wire pair. The human authorized this disposable controlled fixture; its invocation exited0 and `/tmp/zerospin-framework-goal-data-core-UAv4C2/node-lifetimes.log` records four passing cases.

A freshly initialized Node retained the actual captured original/final command pair, two journal rows and contiguous outcomeIndex1. Exact retry preserved allocation and all tables. Closing and reopening a new object over that same nonempty database preserved its generated Node ID, full snapshot, pending receipt, metadata, resources, schema, user version and every table row; the old object remained `node-closed`. This exercises a controlled core copy of the genuine immutable wire pair; it does not claim adoption of the original native producer or a new remote command.

A frozen opening snapshot sink and a separately frozen commands-page sink each retired locally during close. Their late remote resolutions started no SQL and changed no tables. A controlled pause before an actually admitted metadata SELECT kept close pending until that real SQL statement completed; repeated close shared its promise, later reads refused with `node-closed`, and the admitted read returned the retained snapshot before database disposal. These assertions establish the core frozen-sink fence, nonempty reopen and admitted-SQL drainage. They do not substitute for MessagePort/Worker interruption, native file closing or storage-lock teardown.

### Authorized actual browser storage and family-specific execution — 2026-10-11

The real Chromium fixture uses production SharedWorker/capnweb MessagePorts, Web Locks and IndexedDB `IDBBatchAtomicVFS`. Its profile and controls are confined to disposable `/tmp` state. `browser-host.log`, `browser-reopen.log` and `browser-drain-2.log` under `/tmp/zerospin-framework-goal-data-core-UAv4C2/` each record joined exit0. Full Worker/browser destruction and nonempty reopen retain the exact Node ID, schema, user version, immutable pending original and every journal/resource row. Restored paused optimism is then finalized once through the real server under the same command ID, reaching public2/private1/admitted1 with no optimistic work.

Actual logout revokes an old saved API while a surviving tab retains the same Node and tables. Closing with an admitted SELECT held revokes MessagePort capabilities first, drains that real SQL, closes the actual SQLite/VFS and releases the namespace lease last; a new owner cannot acquire before storage close and reopens the exact retained journal afterward. A canceled Web Lock waiter never enters. The disposed local session settles its raw RPC wait with `session-shut-down`; no peer-close completion of an opaque raw RPC is assumed. [Plan111](111-plan-connected-worker-ownership.md) additionally records the six genuine network/replay/admission retirement phases and the actual held-WASM acquisition fence.

`standalone-lifetimes-4.log` records exit0 for the production standalone runtime and real SQL.js Node transaction. Its command is generated by real WASM session staging and the canonical retained-row codec. Interrupting an authored suspended execution rolls back every resource/progress mutation, keeps its exact pending original and closes storage once after drainage. Resolving the retired callback starts no continuation or SQL. A separate successful execution followed by actual reset rotates the Node ID; a saved standalone API and an exact retained-ID retry bound to the old Node both refuse with `standalone-capability-stale` before mutation, while the replacement exposes its full new baseline/private0.

`service-lifetimes-3.log` records exit0 for the current authored service release, actual production service evaluation and the captured genuine Alice service snapshot at public8/hash `2da0cb98c0d52825b470c044dc6b7a35f1ff8df924fc17cb3c1d558568b0f627`. The SQL.js-backed ServiceNode retains the evaluated original and private0 pending receipt, then reopens the exact nonempty snapshot, Node identity, schema, versions and complete tables. The old object remains closed. A frozen opening sink retires locally; its late resolution starts zero SQL. A held admitted metadata SELECT keeps close pending, later reads refuse and the admitted read drains without changing the retained original. These family-specific core checks complement the actual shared browser storage host above.

### Authorized reset delivery epochs and native file drainage — 2026-10-11

`/tmp/zerospin-framework-goal-data-core-UAv4C2/standalone-reset-epochs.log` records exit0 using the real standalone runtime, Node scheduler and SQLite journal. A frozen old opening snapshot and a separately frozen old page each retire during actual Node reset. In both cases the survivor receives the complete replacement snapshot at cursor0 before any page under the replacement Node ID. Resolving the old callback starts zero SQL, produces zero additional deliveries and leaves every table exact. The saved-capability and exact-retry reset assertions also pass in that invocation. This is explicit pending-delivery epoch evidence, separate from ordinary closed-object reopening.

The actual production NativeSession/Swift/SQLite graceful-close check in `/tmp/zerospin-framework-goal-data-core-UAv4C2/native-drain-2.log` holds an admitted real SELECT while Node/storage disposal is pending. Later work refuses, the admitted read completes, both physical SQLite handles close, the directory flock is released after executor teardown and the same complete nonempty journal remains exact. [Plan114](114-plan-native-persistent-owner.md) records the actual host and recovery bounds.

Independent acceptance review finds the immutable retry/allocation, atomic final/resource/private-prefix, opening/page/frozen-sink drainage, standalone interruption, reset capability/epoch and actual host storage criteria complete. Current source gates and reconciled module/architecture documentation remain recorded above. No permanent test, fixture, runner or configuration was added to the repository.

## Remaining work

None.
