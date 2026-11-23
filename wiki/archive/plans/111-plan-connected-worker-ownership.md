# 111 — Owned Node connections and durable storage lifetime

1. **Implementation status:** implemented and verified in the approved goal on 2026-10-11.
2. **Method shape:** establish inputs, run named domain steps in order, and return the owned result. Helpers own behavior and invariants; moving an entire monolith to a differently named file does not satisfy this plan.

3. **Problem and current evidence**
   1. Aggregate and service worker runtimes serialize attachment setup but synchronization launches independent connect/push promises and socket message tails. `stop()` fences generations, aborts authentication and closes the socket synchronously; it does not join those promises. The stale-generation socket close handler returns before settling the opening promise. Runtime close waits its attachment serial and then closes storage. An already queued `receiveCommand` can consequently execute SQL after storage close; shutdown can also wait a 15-second socket timer unnecessarily. See [aggregate synchronization](/Users/morgs32/GitHub/zerospin/packages/browser/src/AggregateNode/AggregateNodeSynchronization.ts:57), [service synchronization](/Users/morgs32/GitHub/zerospin/packages/browser/src/ServiceNode/ServiceNodeSynchronization.ts:57) and [runtime close](/Users/morgs32/GitHub/zerospin/packages/browser/src/AggregateNode/makeAggregateWorkerRuntime.ts:297).
   2. Aggregate/service SharedWorkers hold Web Locks but release them only after successful runtime close. Standalone separates stopping from storage close, but ownership acquisition is not cancellable and attachment must recheck stopping after acquiring ownership. See [aggregate worker owner](/Users/morgs32/GitHub/zerospin/packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts:9) and [standalone owner](/Users/morgs32/GitHub/zerospin/packages/browser/src/StandaloneNode/makeStandaloneSharedWorker.ts:11).
   3. Authentication brokers, attachment runtimes and tab connectors are duplicated between aggregate/service. Their domain-specific baseline and protocol semantics are legitimate differences; provider scheduling, namespace ownership and cancellation are the same responsibilities. Existing inert connectors and atomic snapshot reconciliation from archived Plan 103 already work and remain requirements.
4. **Proposed ownership model**
   1. A storage owner acquires exactly one namespace lease, opens storage, constructs its Node, owns attachment capabilities and connection attempts, and closes them in order. Closing first prevents new work, then aborts transport/authentication, drains already accepted Node SQL and delivery work, attempts storage close, and releases ownership in a finalizer even when another cleanup fails. All callers share one close promise and observe the first cleanup failure after every cleanup is attempted.
   2. Each socket attempt owns its HTTP/ticket request, socket, opening completion, admission waiter/timer and ordered receive tasks. Retiring an attempt settles every local waiter immediately, removes listeners, aborts requests and joins its owned work. Opaque host operations that cannot be interrupted may finish later, but their results cannot publish or enqueue SQL. A retry timer belongs to the connection owner, not an abandoned attempt.
   3. Identity revocation, transport attempt and tab attachment are distinct lifetimes. Preserve those distinctions in named owners rather than collapsing them into one generation counter. Revocation fences every attachment before cleanup; a transport reconnect retains the durable journal and valid identity. A last-tab detach stops transport while retaining durable storage according to the existing worker ownership policy.
   4. `Node.close()` is an internal quiescence barrier, not database close: fence new work; close subscriptions; await already admitted serialized transactions and locally cancellable subscriber delivery tasks; then return. Local cancellation stops awaiting an opaque remote callback, fences its late result and prevents later SQL; a frozen tab cannot delay database cleanup indefinitely. A suspended network request must never hold a Node SQL transaction. Final implementation must be based on the complete Node review, which is owned by Plan 116.
   5. Share a typed authentication provider scheduler, namespace lease and attachment lease. Keep aggregate/service baseline creation, admission identity validation, resource schemas and protocol dispatch as explicit family procedures. Standalone execution retains its local authority and stable cross-build namespace; it has no connected authentication/socket policy.
5. **Ideal parent shape and contracts**
   1. The following is schematic TypeScript; procedures are the concrete owners listed below, not forwarding wrappers.
      ```ts
      const openAggregateWorker = Effect.fn('openAggregateWorker')(function* (
        props: IAggregateWorkerProps,
      ) {
        const storage = yield* acquireNodeStorage(props.storage);
        const node = yield* initializeAggregateNode(storage, props.definition);
        const authentication = makeNodeAuthentication(props.providers);
        const connection = makeAggregateNodeConnection({
          node,
          authentication,
        });
        return makeAggregateWorkerAttachments({ node, connection, storage });
      });
      const closeNodeStorageOwner = Effect.fn('closeNodeStorageOwner')(
        function* (owner: INodeStorageOwner) {
          owner.preventNewWork();
          const stopped = yield* owner.connection.stop().pipe(Effect.exit);
          const drained = yield* owner.node.close().pipe(Effect.exit);
          const released = yield* closeStorageAndReleaseOwnership(
            owner.storage,
          ).pipe(Effect.exit);
          for (const completed of [stopped, drained, released]) {
            if (Exit.isFailure(completed)) return yield* completed;
          }
        },
      );
      ```
   2. `acquireNodeStorage` receives namespace identity, opening effect and host lease adapter; returns the client and one finalizer. Cancellation while waiting never opens a database afterward. Lock acquisition/open failure releases anything already acquired. Host namespaces remain exact current identities, including standalone stable identity and connected definition hash.
   3. `makeNodeAuthentication` owns registered provider leases and a single bounded request round. It returns a verified identity or preserves authentication-unavailable/authentication-rejected/network failure distinctions. An unavailable or throwing provider is not proof of server rejection. Clear cancels every request round and fences late responses.
   4. A family connection exposes `resume`, `pushNow`, `setPushPaused`, `suspend`, `stop` and its readiness/status observation. It owns exactly one active attempt and push pump; `stop` returns its drain barrier after attempt-all local cleanup, preserving its first cleanup failure only after all owned tasks retire. Preserve full Effect failure causes at the Effect boundary; remove `ticketFailure` side-channel Cause capture and nested per-operation runners. Native Promise bridges are confined to actual browser/host APIs.
   5. Attachment leases hold provider registration, subscription and current-identity access. They release idempotently and prevent saved API capabilities from mutating a later identity. Replace postconstruction mutable `isCurrent`/`detach` fields with an owned immutable lease reference.
6. **Explicit removals and retained behavior**
   1. Delete duplicated aggregate/service provider scheduling and lifetime code once callers use the shared owners. Delete detached connection/push bookkeeping and Cause side channels replaced by owned tasks; do not retain two execution paths or a generic protocol adapter.
   2. Preserve durable command IDs, immutable payload bytes, Node/push/outcome positions, producer retry semantics, push pause, exact claims binding, multi-tab subscription ordering, offline cached attachment and readonly readiness. Preserve initial snapshot receipt-or-missing reconciliation before publication.
   3. Intentional internal API change: synchronization stop becomes awaitable, and Node exposes quiescence. Closing settles local work promptly and releases a namespace even when cleanup reports failure. No wire, fixed schema or public SDK signature change is required solely for ownership.
   4. Depend on the separately drafted service tagged-protocol/fixed-replay plan for service wire dispatch. Depend on the operation-codec plan for strict bound operation decoding and the canonical result-journal plan for removing redundant source/executed cursors; do not recreate these owners or retain deprecated cursor aliases here.
7. **Source hierarchy** (`+` create, `~` modify, `-` delete; paths rooted at `zerospin/`)
   ```text
   ~ packages/browser/src/Node/
     + acquireNodeStorage.ts
     + makeNodeAuthentication.ts
     + makeNodeAttachment.ts
     + makeSocketAttempt.ts
   ~ packages/browser/src/AggregateNode/
     ~ makeAggregateSharedWorker.ts
     ~ makeAggregateWorkerRuntime.ts
     ~ AggregateNodeSynchronization.ts
     ~ connectAggregateNode.ts
     - AggregateNodeAuthentication.ts
   ~ packages/browser/src/ServiceNode/
     ~ makeServiceSharedWorker.ts
     ~ makeServiceWorkerRuntime.ts
     ~ ServiceNodeSynchronization.ts
     ~ connectServiceNode.ts
     - ServiceNodeAuthentication.ts
   ~ packages/browser/src/StandaloneNode/
     ~ makeStandaloneSharedWorker.ts
     ~ makeStandaloneWorkerRuntime.ts
     ~ connectStandaloneNode.ts
   ~ packages/core/src/AggregateNode/AggregateNode.ts
   ~ packages/core/src/ServiceNode/ServiceNode.ts
   ~ packages/native/src/makeNativeSession.ts
   ```
8. **Ordered implementation**
   1. Complete the Node quiescence design and align service-protocol/operation-codec ownership. Record accepted async SQL/subscriber work precisely before changing shutdown.
   2. Introduce cancellation-safe namespace ownership and attachment leases; migrate all three worker makers without changing their namespace identity policy.
   3. Introduce the provider scheduler and migrate both connected families. Move each family's transport work into scoped attempts, preserving its actual protocol and errors.
   4. Fence and drain Node work, make worker/native close await the complete barrier, and make cleanup attempt-all with final lease release. Remove old fields/classes and update direct callers together.
   5. Simplify duplicated tab connection orchestration around the lease owner only where the steps are identical; retain explicitly named family binding/snapshot procedures.
9. **Acceptance and verification**
   1. Closing during namespace wait, HTTP bootstrap, ticket request, socket open, replay, admission and queued receive has one deterministic completion; no later callback touches a closed database or publishes a stale identity. Existing accepted transactions commit or roll back before storage close.
   2. A failed storage close still releases the Web Lock; repeated/reentrant dispose calls await the same drain. A new worker can acquire the namespace after shutdown. Two active owners never use one file concurrently.
   3. Provider timeouts, denial, unavailable tabs, identity clear, retry and last-tab detach preserve their observable distinctions; command receipts, replay positions and hashes remain unchanged.
   4. Resolved Nx browser targets are `lib`, `ts` and `lint`; run them with affected core/native consumers through existing Nx tasks. There is no browser permanent test/check target. Reuse actual worker/MessagePort/Node APIs and existing TicTacToe runtime seams for interruption, two-tab ownership and offline/reconnect evidence without adding fixture files or runners. Shopping browser verification is prohibited. An in-memory script alone cannot establish browser Web Lock, IndexedDB or multi-tab behavior; record that limitation if the actual host seam is unavailable.

10. **Cross-plan ownership:** [105](105-plan-immutable-authored-declarations.md) owns immutable authored declarations; [106](106-plan-canonical-authored-manifest-projections.md) owns manifest/lock projections; [107](107-plan-contract-evaluation-phases.md) owns prepared contract inputs/evaluation; [108](108-plan-model-operation-codecs.md) owns strict resource and operation codecs; [109](109-plan-bound-database-definition.md) owns schema/index provisioning; [110](110-plan-sqlite-execution-and-commit-observation.md) owns committed SQL/table notifications. Use those owners where applicable and do not recreate them in this refactor. The server service-protocol/result-journal proposals own their wire/cursor hard cutovers.

11. **Documentation lifecycle:** after implementation, reconcile affected package READMEs, architecture citations and `wiki/glossary.md` against actual source. Create or supersede an ADR only for a qualifying implemented decision with a consequential tradeoff; do not manufacture an ADR for extraction. Preserve completed Plans 100/103 as historical evidence. Archive this plan only after its acceptance criteria and available verification are complete, recording remaining environmental limitations accurately.

## Implementation progress — 2026-10-11

Connected aggregate/service workers now own namespace acquisition, port capabilities, serialized attachments, bounded authentication and the current ordered socket attempt. Storage opening is cancellable; close revokes local capabilities, retires opaque waits, drains admitted Node work, closes SQL/VFS and releases the lease last. Provider failure is unavailable unless verification establishes explicit rejection. Standalone execution shares the worker/Node owners and propagates cancellation into authored programs before Node drainage.

Browser/React `lib`, `ts` and `lint`, plus the connected worker dependency graph, passed in `/tmp/zerospin-goal-quality-8.log`. Native build/type/lint consumers also passed in `/tmp/zerospin-goal-consumers-5.log`. The final worker lint task and scoped edited-file lint passed with zero source warnings. Controlled Web Lock exclusivity, frozen provider/capability cleanup and the subsequent actual browser storage/port retirement checks are recorded below; the earlier normal mounted two-tab case remains separate. No current public example imports the standalone release constructor; TicTacToe is a connected aggregate seam. The four assigned browser workflow documents and package lifecycle README have been reconciled with current source.

### Actual mounted connected aggregate — 2026-10-11

Two native Chrome tabs at `http://127.0.0.1:53020/` selected the same real game `06538c4b-3fe5-44c4-9ef9-3e61b5a38e77`. An ordinary Square1 move in the second tab reached `XO.......` in both. Closing only that tab left the original usable: Square5 reached `XOO.X....`, and the reopened second tab displayed the same board. Square9 then reached `XOO.X...X`/`X wins!`. Both tabs' server-side originals used one durable producer, `node_1fdsGFACy-lSB8DH5MM-Q`, with own push indices1–4, public progress6 and server private prefix4. This establishes normal shared-port application convergence, surviving-tab progress and ordinary same-owner tab reopening through the existing connected worker path.

The second tab then used New game/Start game and Square5 to select game `d2d47ddb-86f6-4fe7-be5a-3c7e56c9a082`, reaching `O...X....` under distinct producer `node_3O4Qh7bjNzMeQl6Kzl1vE`, while the original tab retained its terminal game. Read-only actual server rows confirmed each selected graph/checkpoint and the new owner's public3/private2; all nine retained hashes independently derived from genesis. [Plan118](118-plan-version-result-owner.md) records the counts and `/tmp/zerospin-goal-mounted-retry-browser-{baseline,private-baseline,independent-owners}.log` evidence. No browser-local metadata, namespace lock state or SQL/VFS close was sampled. Closing one tab while another remained is not full SharedWorker destruction, last-tab teardown, offline recovery, interrupted admission or lost-receipt proof.

### Actual native automatic offline recovery — 2026-10-11

The current native app retained winning `playX` command `cmd_KQiViojj-n3hZOYb2ctZZ` at push4/node9 through actual OS process close/reopen and an app update while the owned backend was down. Its exact payload remained `{"id":"gam_ba36661779d14154bbd4d6bc24eb3d44","board":"XOO.X....","square":8}`. The first run exposed failed-attempt retirement aborting the same Effect driver before failure policy ran. Both aggregate/service synchronization files now let the signal-bound driver settle, then join failed-attempt cleanup and classify the preserved Cause without that signal. Fresh browser/native/iOS gates passed; the actual installed JavaScript application bundle was SHA256 `f78b4b5db843d2ff870ac466d9c62769a80093b22a4ab49008d9fd469a40204b`.

The repaired app made at least 14 real unavailable authentication attempts about 3 seconds apart while the backend remained down. Restoring that backend, without Home/foreground, Retry connection or manual push, yielded one retained final success for the unchanged original at public6/node10. Actual Node metadata reached private4/admitted4, the session reached afterNode10, optimism cleared and both graphs reached `XOO.X...X`. The second real game remained independent. [Plan118](118-plan-version-result-owner.md#actual-native-offline-recovery-and-independent-owner--2026-10-11) records complete cursor/hash and retained-row evidence. This verifies aggregate native automatic retry and pending recovery, not browser SharedWorker destruction, service authentication, controlled receipt loss, SQL drainage or disposal timing.

Actual RunningBoard/SpringBoard records also confirmed ordinary background suspension after Home at19:20:55Z. Complete two-owner SQL rows and file/preference identities remained exact in later read-only samples and after purpose-built OS termination at19:26:48Z. Foreground/resume after that suspension and graceful JS/SQL drainage were not observed.

### Headless shared connection and local Node drain — 2026-10-11

An inline invocation uses the actual `AggregateNode`, the existing real SQL.js statement adapter, production authentication/synchronization owners, the current authored game lock and the retained native game's ordinary first-party credentials. A new Node allocated by the real initializer installs the genuine node-less public6 baseline/hash `f41d6eeeefdb0fc8df5b5e9b92966cc5a5d931b3684e4066bf3891ccf5f57049` with its own private0. No network response, provider result, SQL operation or authored declaration was fabricated; no verification files or source/build changes were added.

Stopping while the actual snapshot verification remained pending completed the local connection drain in approximately4.3ms; repeated `stop()` returned the same promise. The real retired HTTP request then settled without altering exact Node identity, metadata, resources or pending/final partitions, and no reconnect occurred during the next3.2seconds. Resuming authentication/enabling synchronization reached online through actual admission, ticket issuance and WebSocket replay. A second stop/enable/reconnect replaced the real connection while preserving the same Node/public6/hash/private0 and resources. After final synchronization stop, an already-admitted Node snapshot drained before `Node.close()` completed; repeated close shared the same promise, and a new read returned the sole typed `node-closed` refusal before SQLite was closed. The invocation exited0 (`/tmp/zerospin-goal-111-headless-connection-lifecycle.log`).

This establishes shared synchronizer acquisition cancellation, late-result fencing, ordinary connection replacement and local accepted-read drainage against the actual backend. SQL.js supplies real statement execution, but this invocation does not acquire browser Web Locks, IndexedDB/VFS or MessagePorts and does not run the Swift host. Later controlled and actual browser checks below establish the distinct frozen-wait, admitted-write and physical storage/Worker retirement cases.

### Authorized controlled connection owner checks — 2026-10-11

Disposable `/tmp` fixtures exercise production authentication, socket-attempt, attachment, namespace-lease and storage-close owners. Missing, throwing, frozen and detached providers resolve unavailable; explicit rejection remains distinct. Concurrent rounds coalesce, clear retires pending authentication, mismatched resume identity refuses and stale generations cannot publish. Retiring a socket attempt promptly settles an opaque frozen wait, synchronously fences callbacks and shares one stop promise. Accepted delivery drains before retirement; queued stale delivery is skipped. Release attempts continue after an earlier release throws, including late ownership registration.

The actual Node Web Locks capability held one namespace while a second owner waited; a third canceled waiter returned the existing detached refusal. Production storage close ordered port revocation, synchronization retirement, Node drain, runtime release, native-storage close and lease release. A forced storage-close failure still released the namespace, the waiting owner acquired only after release, and subsequent reacquisition succeeded. Attachment disposal is idempotent/reentrant and releases every registered capability. The runner joined with exit0; evidence is `/tmp/zerospin-framework-goal-tooling-111-lifetimes.log`. These exercise production owners and real Node Web Locks with controlled resource callbacks; the later actual browser IndexedDB/VFS, SharedWorker and MessagePort host checks are recorded separately below.

### Authorized genuine connection-phase retirement — 2026-10-11

`/tmp/zerospin-framework-goal-tooling/111-phases.mjs` uses the production aggregate authentication/synchronization owners, a real SQL.js-backed `AggregateNode`, real WASM session staging and the isolated authored Worker at `127.0.0.1:62494`. Its credentials, snapshots, tickets, command originals, admission acknowledgements and replay frames come from the real server. The fixture delays actual host results or frames; it supplies no invented authority or receipt. All six cases pass and the runner joins with exit0 in `/tmp/zerospin-framework-goal-tooling-111-phases.log`.

Stopping during snapshot verification, ticket acquisition, socket opening, replay completion, command admission and an already accepted receive each settles the local owner exactly once in approximately0.15–1.09ms. Repeated `stop()` and `Node.close()` return their respective existing promise. Listeners are removed before held host results are released; actual late HTTP replies and socket frames initiate zero SQL after physical database close and cannot publish a retired identity. In the accepted-receive case, Node close remains pending until the actual SQLite transaction is released and committed; a queued duplicate of the genuine final frame is skipped after retirement. The journal retains its original and one final. These are controlled genuine transport/SQLite checks, complementary to the actual browser storage host below.

### Actual Chromium storage, MessagePort and namespace ownership — 2026-10-11

The isolated Chromium fixture uses production SharedWorker/capnweb connections, a real browser Web Lock and IndexedDB `IDBBatchAtomicVFS`; its browser profile and controls are confined to disposable `/tmp` state. `/tmp/zerospin-framework-goal-data-core-UAv4C2/browser-host.log`, `browser-reopen.log` and `browser-drain-2.log` each record a joined successful run. Full worker/browser destruction closes actual SQL/VFS before releasing the namespace. Reopening the same nonempty profile preserves the exact Node identity, schema and retained pending original. Its paused optimism is restored; unpausing delivers that same command once, reaching public2/private1/admitted1 with no remaining optimism.

Actual logout revokes saved old capabilities before a current-identity survivor reconnects; the revoked capability starts no SQL, and the survivor retains the same Node and complete tables. Closing while an admitted SELECT is frozen first revokes MessagePort capabilities; the production local connection disposer settles its opaque pending RPC, while Node close still waits for the accepted SQL. A canceled Web Lock waiter never enters. Releasing the SQL then enters actual storage close, which is held independently: namespace handover occurs only after SQL/VFS close completes. A subsequent owner reopens the exact complete journal/schema/resources. These establish the physical host ordering separately from the controlled six-phase network retirement and existing native offline recovery.

The separate first-only acquisition fixture holds the actual WASM fetch before storage opens. Disposing returns the local `session-initialization-canceled` refusal while the namespace lease remains held until the genuine module completion. That late completion creates no VFS, Node or SQL work; the owner then releases the lease and the Worker/Chromium join successfully. `/tmp/zerospin-framework-goal-data-core-UAv4C2/browser-wasm-cancel-2.log` records `worker-ready`, `storage-opening`, `closing`, `owner-closed`, SQL count0 and exit0. Earlier combined acquisition fixture runs passed this same case but timed out in a separate late-VFS control; this isolated rerun establishes a clean completion without treating that extra control as an acceptance gate.

## Remaining work

None.
