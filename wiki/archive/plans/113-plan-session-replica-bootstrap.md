# 113 — Finite browser replica bootstrap and command handoff

1. **Implementation status:** implemented and verified in the approved goal on 2026-10-11.
2. **Method shape:** establish inputs, run named domain steps in order, and return the owned result. Helpers own behavior and invariants; moving an entire monolith to a differently named file does not satisfy this plan.

3. **Problem and evidence**
   1. [aggregate bootstrap](/Users/morgs32/GitHub/zerospin/packages/browser/src/bootstrapAggregateSession.ts:45) and [service bootstrap](/Users/morgs32/GitHub/zerospin/packages/browser/src/bootstrapServiceSession.ts:43) each combine replica acquisition, provisioning, resource/command binding, failure observers, handoff, connection callbacks, snapshot import and public capability publication. Most of their length comes from those domain phases remaining inline.
   2. [makeSessionCommandOutbox](https://github.com/morgs32/zerospin/blob/e42022896448d48c0320c049fae8f3c439e62966/packages/browser/src/outbox/makeSessionCommandOutbox.ts#L1) maintains pending row selection, receipt imports, epoch fences, waiters, a delivery owner and a microtask pump. The core delivery procedure owns page retry and a semaphore; the browser owner separately owns pump/waiter/epoch state. These are distinct responsibilities, but the browser owner can make that relationship explicit. Its completion condition is disappearance of the original from the replica pending journal, not receipt arrival alone.
   3. Current atomic snapshot reconciliation and committed progress publication are correct and were completed in archived Plan 103. This proposal is not a second implementation of their transaction algorithm.
4. **Proposed model**
   1. An aggregate or service replica owns its typed SQLite client, projection/journal, initialized capability and committed progress publication. A handoff owner owns transfer of locally committed originals to the durable Node and waits for receipt import to remove them from the pending journal. A connector owns the worker attachment. The session lifetime owns all three.
   2. Keep aggregate and service projection operations explicit. Share lifetime-safe acquisition, failure observation and the handoff scheduler only where responsibilities are identical. A generic binding/context object containing every operation obscures ownership and is excluded.
   3. The core session transaction remains the sole projection/journal authority. Snapshot installation validates the receipt-or-missing partition and Node epoch, imports acknowledged originals, rewinds optimism, replaces authoritative resources, reinstalls pending originals and rebases once in the existing synchronous transaction. The browser receiver invokes that complete transaction and publishes only its committed result.
5. **Ideal parents and procedure contracts**

   ```ts
   const bootstrapAggregateSession = Effect.fn('bootstrapAggregateSession')(
     function* (props: IAggregateBootstrapProps) {
       const binding = decodeAggregateSessionBinding(props);
       const replica = yield* openAggregateReplica(binding);
       const handoff = makeSessionCommandHandoff(replica);
       const receiver = makeAggregateReplicaReceiver({ replica, handoff });
       const connection = yield* attachAggregateNode({ binding, receiver });
       yield* connection.start();
       return makeAggregateSessionControls({ replica, handoff, connection });
     },
   );
   const installAggregateReplicaSnapshot = Effect.fn(
     'installAggregateReplicaSnapshot',
   )(function* (props: IAggregateReplicaSnapshotInput) {
     const reconciliation = validateAggregateReplicaSnapshot(props);
     yield* applyAggregateSessionSnapshot(reconciliation);
     publishAggregateReplicaCapability(reconciliation.replica);
   });
   ```

   1. `openAggregateReplica`/`openServiceReplica` acquire the client, provision the declared resources and command indexes, initialize the session and return typed mutation/query/publication methods. Acquire failure and interruption close acquired clients; finalizers run after owned work drains.
   2. `makeSessionCommandHandoff` accepts the pending journal query, command preparation, receipt import and attachment lease. It owns one pump, waiters and one lifetime/Node-epoch fence. Acceptance returns only after the immutable original is retained by Node and imported into the replica; socket admission/server finalization remain subsequent milestones. An uncertain handoff remains pending and retryable.
   3. The pending query selects producer originals without a final counterpart in session order. Use the actual journal schema/SQL rather than maintaining a second pending state or repeatedly reconstructing completed-ID sets in unrelated layers. Confirm available index/query semantics against the complete core review before changing query ownership.
   4. `makeAggregateReplicaReceiver`/`makeServiceReplicaReceiver` validate current attachment and epoch, install snapshots or ordered pages through the existing core transaction, update handoff completion and publish readonly capability/status afterward. No observer is called from inside a transaction. An observer throw is isolated from already committed commands.
   5. Disposal first fences the receiver and handoff, unsubscribes committed-row observation, retires attachment, drains the handoff and closes the replica client. Reset/new Node epoch rejects old waiters and requires complete reconciliation before accepting another handoff.

6. **Removals and intentional behavior**
   1. Delete provisioning, publication and reconciliation closures from both bootstrap parents. Retain core `makeOutboxDelivery` as the bounded page delivery/retry procedure; it has no independent scheduled pump. Replace the browser owner's detached Promise/microtask runner loop with one lifetime-owned handoff Effect and explicit wake/completion state. Remove redundant scheduled/running/pumping bookkeeping only when the owned task now supplies that state; do not add a wrapper that keeps both execution owners.
   2. Reuse `makeSessionFailureObserver` across aggregate, service, standalone and agent replica paths. Preserve local-origin event correlation and one event per committed failure. Remove duplicate maps only after ownership moves to this observer.
   3. Keep public SDK/release signatures, offline staging, blocked readiness, immutable original bytes, local session ID/index, durable Node receipt and projection semantics. No fixed schema, wire or server protocol change is required by the bootstrap split.
   4. Standalone remains locally authoritative and uses the aggregate replica receiver under its explicit binding; it does not acquire connected authentication semantics. Native can reuse the same replica/handoff owners through host SQLite/attachment adapters after its separate lifetime plan.
7. **Source hierarchy** (`+` create, `~` modify, `-` delete; rooted at `zerospin/`)
   ```text
   ~ packages/browser/src/bootstrapAggregateSession.ts
   ~ packages/browser/src/bootstrapServiceSession.ts
   + packages/browser/src/sessionReplica/openAggregateReplica.ts
   + packages/browser/src/sessionReplica/openServiceReplica.ts
   + packages/browser/src/sessionReplica/makeAggregateReplicaReceiver.ts
   + packages/browser/src/sessionReplica/makeServiceReplicaReceiver.ts
   + packages/browser/src/sessionReplica/bindServiceReplicaCommands.ts
   + packages/browser/src/outbox/makeSessionCommandHandoff.ts
   - packages/browser/src/outbox/makeSessionCommandOutbox.ts
   ~ packages/browser/src/outbox/makeOutboxSubscriber.ts
   ~ packages/browser/src/Node/makeSessionFailureObserver.ts
   ~ packages/browser/src/publishAggregateSessionProgress.ts
   ~ packages/browser/src/makeBrowserSession/createAggregateBrowserSession.ts
   ~ packages/browser/src/makeBrowserSession/createServiceBrowserSession.ts
   ~ packages/browser/src/makeBrowserSession/createStandaloneBrowserSession.ts
   ```
8. **Ordered implementation/dependencies**
   1. Coordinate Plans 108, 110 and 117 for operation, committed observation and replica journal/projection ownership. The complete core outbox review confirms bounded page delivery remains a meaningful procedure. Keep those transactions shared and explicit. Connected worker lifetime and Node quiescence are required for a complete disposal proof.
   2. Introduce typed replica openers/receivers around existing transaction procedures; migrate one family at a time while each family has one implementation path.
   3. Consolidate the handoff scheduler and pending query under one owner, preserving its definitive journal completion condition. Move failure/progress publication after commitment.
   4. Slim both bootstrap parents, update all constructors including standalone, delete superseded closures/modules, and reconcile public method documentation.
9. **Acceptance and verification**
   1. A failed handoff retains the immutable original for retry; a successful receipt alone cannot falsely finish a waiter before projection journal reconciliation. Concurrent stage/replay/reset never drops an original or publishes a partially rebased projection.
   2. Same-epoch attachment reconciliation and different-epoch reset remain distinct. Every requested ID is exactly acknowledged or missing; contradictory snapshots fail before replica mutation. A finalized failure reports once and keeps correct optimistic survivors.
   3. Fresh bootstrap returns on its first usable readonly/writable state; long-lived pumps remain lifetime children. Reentrant disposal rejects pending waiters and drains all owned work before DB close.
   4. Use resolved browser/React `lib`, `ts`, `lint` and core `lib`, `lint`, `tsc:typecheck` Nx tasks. Existing browser packages have no permanent test/check target. Reuse existing SQLite/core snapshot APIs and actual TicTacToe/Studio worker seams for same-epoch reconnect, lost receipt, offline staging, reset and disposal. Do not add tests/fixtures/runners/configuration. Distinguish transaction evidence from unavailable actual multi-tab/browser evidence.

10. **Cross-plan ownership:** [105](105-plan-immutable-authored-declarations.md) owns immutable authored declarations; [106](106-plan-canonical-authored-manifest-projections.md) owns manifest/lock projections; [107](107-plan-contract-evaluation-phases.md) owns prepared contract inputs/evaluation; [108](108-plan-model-operation-codecs.md) owns strict resource and operation codecs; [109](109-plan-bound-database-definition.md) owns schema/index provisioning; [110](110-plan-sqlite-execution-and-commit-observation.md) owns committed SQL/table notifications. Use those owners where applicable and do not recreate them in this refactor. The server service-protocol/result-journal proposals own their wire/cursor hard cutovers.

11. **Documentation lifecycle:** after implementation, reconcile affected package READMEs, architecture citations and `wiki/glossary.md` against actual source. Create or supersede an ADR only for a qualifying implemented decision with a consequential tradeoff; do not manufacture an ADR for extraction. Preserve completed Plans 100/103 as historical evidence. Archive this plan only after its acceptance criteria and available verification are complete, recording remaining environmental limitations accurately.

## Implementation progress — 2026-10-11

Aggregate/service replicas own scoped client acquisition and schema/index provisioning. Their current receiver owns core snapshot/page reconciliation and publication. Shared handoff owns one scoped delivery Fiber, originating IDs, retained-SQL waiters and cancellation; late subscribers release their capability, and acknowledgement preserves unknown authored errors/full Causes. Persistent native replicas reuse the aggregate pending-original reader and receiver. Superseded makeSessionCommandOutbox was deleted.

Browser/React `lib`, `ts` and `lint` passed in `/tmp/zerospin-goal-quality-8.log`; the native bundle, real `ts` and `lint` consumers passed in `/tmp/zerospin-goal-consumers-5.log`. The assigned bootstrap/command workflow documents and package lifecycle README are written. Source review established acquisition/fence/drain order. Normal same-owner mounted tab reopening is recorded below; missing/lost receipt partitions and late disposed-tab publication fencing remain unverified in a live browser.

### Actual mounted bootstrap and normal handoff — 2026-10-11

The existing TicTacToe app bootstrapped two same-origin Chrome tabs at `http://127.0.0.1:53020/` onto real game `06538c4b-3fe5-44c4-9ef9-3e61b5a38e77`. A staged Square1 move in the second tab converged to `XO.......` in both. After that tab closed, the survivor staged Square5 and reached `XOO.X....`; reopening the second tab restored the current selected board. A subsequent Square9 move reached the same terminal `XOO.X...X` board in both. Actual server originals retained one Node identity `node_1fdsGFACy-lSB8DH5MM-Q`, own push indices1–4 and scoped private prefix4 at public6. This establishes normal application bootstrap, command handoff/publication, survivor progress and same-owner tab reopening through actual MessagePort-backed connected sessions.

The second tab's existing New game/Start game controls then initialized game `d2d47ddb-86f6-4fe7-be5a-3c7e56c9a082` under distinct Node `node_3O4Qh7bjNzMeQl6Kzl1vE`. Square5 reached `O...X....` there while the original tab kept its terminal graph. Paired read-only server inspection found public3/private2 for the new owner, matching selected resources/checkpoints for both games and nine independently derived journal hashes. [Plan118](118-plan-version-result-owner.md) records `/tmp/zerospin-goal-mounted-retry-browser-{baseline,private-baseline,independent-owners}.log` and full row counts. No local pending journal/receipt waiter was inspected. These are normal handoffs, not lost-receipt, paused/offline pending-original recovery, full SharedWorker destruction, startup interruption or a late callback after replica SQL close.

### Actual persistent native pending recovery — 2026-10-11

Actual OS process close/reopen and an app update retained the same native Node/session identities, main-file identities and exact winning original `cmd_KQiViojj-n3hZOYb2ctZZ` at push4/node9 while offline. After the shared synchronization retirement repair, the app automatically retried authentication and delivered that original when the backend returned, without a manual retry, push or lifecycle poke. The single final arrived at public6/node10, private4/admitted4; the replica reached afterNode10, removed its one optimistic operation and matched the authoritative `XOO.X...X` graph/hash. All prior nine local journal rows remained exact. A newly selected real game then reached `O...X....` at public3/private2 while every old winner rowset remained unchanged. [Plan118](118-plan-version-result-owner.md#actual-native-offline-recovery-and-independent-owner--2026-10-11) records the actual host/SQL evidence and fresh gates.

This establishes ordinary persistent aggregate replica reopening, pending-original replay and authoritative reconciliation across unavailable transport. It does not establish lost receipts, paused push, an interrupted handoff fiber, canceled initialization, late publication after SQL close or service identity.

### Bounded shared transport cancellation — 2026-10-11

The existing shared authentication/synchronization owners pass actual headless snapshot-acquisition cancellation, late-response fencing and ordinary stop/enable/reconnect against the real TicTacToe backend. A real SQL.js Node retains its captured public6/hash/private0 identity/resources across both connections and drains an accepted snapshot before memoized close; later reads receive `node-closed` (`/tmp/zerospin-goal-111-headless-connection-lifecycle.log`, [111](111-plan-connected-worker-ownership.md)). This proves those shared connection/Node boundaries. It does not instantiate a browser session replica, exercise pending handoff waiters or close MessagePort/IndexedDB resources, so the bootstrap/disposal criteria below remain open.

### Authorized handoff failure and disposal checks — 2026-10-11

After explicit human authorization for disposable `/tmp` verification fixtures/runners, the production `makeSessionCommandHandoff` passes five controlled cases: disposing a frozen receive fences its late receipt; reset rejects old-epoch waiters and prevents import before a new wake recovers the same original; a failed receipt import retains the original and recovers on the next wake; an empty receipt returns `node-acceptance-records-invalid` after one receive with no import; and disposal during frozen capability acquisition completes promptly, with the late capability released exactly once and no receive/import. Repeated disposal joins the same owned pump. Each runner scope closes, with exact receive/release/import counts (`/tmp/zerospin-framework-goal-root-20261011/handoff.mjs`, `/tmp/zerospin-framework-goal-root-20261011/handoff.log`, exit0).

The acquisition case exposed the common outbox masking subscriber acquisition. [127](127-plan-outbox-retry-policy.md) records the repair, full Cause preservation and fresh affected gates. These fixtures exercise the actual handoff owner with an explicit pending-list/receipt-import dependency; they do not exercise a full browser replica, physical SQL close or SharedWorker destruction. The remaining host criteria retain those distinctions.

### Authorized complete replica bootstrap — 2026-10-11

The authorized disposable runner `/tmp/zerospin-framework-goal-root-20261011/bootstrap.mjs` passes (exit0, `bootstrap.log`). It captures a genuine selected baseline from the isolated Workerd Gateway, then initializes the actual AggregateNode on SQL.js and the unchanged production `bootstrapAggregateSession`/WASM replica. The existing optional connector seam wraps the actual AggregateBrowserSessionApi and Node subscription; its synchronization dependency is explicitly controlled. Node's inability to fetch file URLs is handled only by serving the installed WASM bytes to the unchanged production factory.

Actual synchronous staging updates the declared entry, and the production handoff imports Node acceptance coordinates into the real replica command row. A repeated same-epoch reconnect retains one original. Pause is durable in Node metadata; the exposed controls delegate to the actual attached API. Clearing authentication signs out the Node while retaining its pending original. Aborting the replica makes saved initialize/commands/state/reconnect callbacks inert. Scope closure disposes the connection once, clears initialized state and closes the actual WASM handle, whose subsequent SQL statement refuses. A separate interrupted-startup case retires the connection once and prevents late readiness/initialization publication; its unpublished SQL handle was not separately sampled. No browser Worker, IndexedDB, OPFS or authoritative server push is claimed by this bounded Node connector.

### Authorized complete handoff and physical-host audit — 2026-10-11

The final production handoff invocation passes all six cases and exits0 (`/tmp/zerospin-framework-goal-root-20261011/handoff-final.log`). In the additional successful-receipt case, the real handoff receives a nonempty Node receipt while its explicit import dependency is held. Its immutable original remains pending and neither of two callers finishes. Releasing the import removes that original, settles both callers once and releases the subscriber exactly once. Concurrent repeated disposal joins retirement without another release. This establishes journal reconciliation, rather than receipt arrival, as handoff completion. The other five cases retain their bounded acquisition, epoch, lost/import-failure and cancellation proofs described above.

[117](117-plan-session-reconciliation-and-evaluation.md) supplies real SQLite receipt-or-missing partitions, contradictory snapshot rejection before mutation, same/different epoch behavior, atomic survivor rebase and one committed failure event. [112](112-plan-agent-session-owners.md) additionally verifies genuine loss/refusal, atomic journal rollback and observer isolation. These transaction and handoff checks remain distinct from transport timing.

The actual isolated headless Chrome checks in [111](111-plan-connected-worker-ownership.md) use production SharedWorker, MessagePort, IndexedDB AtomicVFS and Web Locks. Paused staging persists its exact original and Node identity. Complete Worker and Chromium destruction followed by reopening the same nonempty journal retains schema, all rows, pause and optimistic value; resuming delivers that same original once and reconciles its final/public/private progress. Logout fences saved capabilities while preserving a surviving subscriber and retained rows. Holding accepted real SQL demonstrates its drain before actual SQLite/VFS close and namespace handover; a cancelled lock waiter never enters. The six genuine HTTP/WebSocket retirement phases in that plan fence late responses before SQL close. The unchanged production WASM bootstrap above separately proves first readiness, same-epoch reconnect, saved callback fencing and cancelled initialization.

These complementary checks cover the plan's acquisition, journal completion, reset, publication and disposal requirements without treating controlled timing as a different host observation. All owned runner/replica scopes join; separately owned temporary providers remain only for coordinated verification and cleanup. The affected source/consumer gates and document ownership/citation checks pass. An independent completion audit finds no uncovered acceptance criterion.

## Remaining work

None.
