# SharedWorker owner cleanup with a reusable host

**Date:** 2026-10-20

**Status:** Complete; published as `19.0.0`, adopted in QRK and verified at the
protocol, compilation and actual Library browser seams below.

## Problem and agreed behavior

1. Closing a tab or disposing its session currently removes, at most, its port
   attachments. The application SharedWorker can retain its Node, SQLite/VFS,
   synchronization runtime and namespace lease. A later build using that same
   namespace can then wait behind an idle owner indefinitely.
2. Release those owned resources when the last live client leaves. Retain the
   lightweight SharedWorker host and its `connect` listener so a later client can
   create a fresh owner. Apply the same ownership rule to Aggregate, Service and
   Standalone workers.
3. Keep the existing public `session.dispose()` completion contract: it fences
   that session and waits for its local cleanup. Shared-owner cleanup happens
   asynchronously after the last client detaches; disposal is not an
   acknowledgement that SQLite or the namespace lease has closed. Add no public
   shutdown operation or teardown acknowledgement.
4. Preserve [Plan 247's storage identity](./247-plan-standalone-session-lock-storage.md).
   Reopening the same partition uses its retained data. This plan changes no
   database key, authored backup path, session identity, framework schema, seed,
   reset authority or attachment identity validation.

## Terminology and evidence

1. **Host** means the SharedWorker global scope and its connection listener.
   **Owner** means one closeable acquisition of a family runtime, its Node,
   SQLite/VFS, synchronization resources and namespace lease. Successive owners
   in one host never overlap. **Client** means one valid bootstrapped port with a
   document-owned lifetime lock; it need not have finished session attachment.
2. [`makeWorkerConnections`](../../../packages/browser/src/Node/makeWorkerConnections.ts)
   currently detects cooperative RPC breakage and disposes per-port APIs. It
   neither closes an empty owner nor reliably learns that a document disappeared.
   The family `make*SharedWorker` functions create their namespace lease and
   runtime eagerly, and their shutdown paths close the global listener too.
3. [`closeNodeStorageOwner`](../../../packages/browser/src/Node/closeNodeStorageOwner.ts)
   currently attempts all stages and releases the namespace even if an earlier
   stage fails. The new owner path must retain the namespace when closure cannot
   be confirmed; otherwise another owner can open over uncertain resources.
4. Aggregate and Service connectors already watch namespace ownership after
   `ready()`. Standalone `ready()` currently reports version/artifact identity
   without awaiting ownership and its connector has no corresponding watcher.
   Existing runtime shutdown already provides cancellation and ordered drainage;
   reuse it instead of adding another execution lifecycle.
5. MessagePort has no portable peer-close notification. CapnWeb's cooperative
   `null` close frame cannot cover document crashes. A document-owned Web Lock
   supplies the missing browser-managed lifetime signal: unloading or terminating
   its agent releases held locks. See [HTML message ports](https://html.spec.whatwg.org/multipage/web-messaging.html#message-ports)
   and [Web Locks termination](https://w3c.github.io/web-locks/#lock-termination).
6. A retained host avoids the constructor race with a closing SharedWorker and
   avoids discarding queued connection messages during idle shutdown. See
   [SharedWorker construction and lifetime](https://html.spec.whatwg.org/multipage/workers.html#dom-sharedworker).
   Hidden, frozen and cached documents remain live while the browser retains
   their locks. Do not introduce visibility expiration or promise BFCache
   eligibility; browser behavior can vary. See [Chrome's page lifecycle guidance](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
   and the [Web Locks BFCache cases](https://github.com/web-platform-tests/wpt/tree/master/web-locks/bfcache).

## Decisions and trade-offs

1. Use a unique document-owned Web Lock per connection, separate from the
   existing worker-owned namespace lock. The former detects client loss; the
   latter excludes simultaneous storage owners. Existing Web Locks support is
   already required for namespace ownership.
2. Acquire that client lock before constructing the SharedWorker. Bootstrap the
   raw port before CapnWeb starts so the host knows which document lifetime to
   watch even during namespace waits or attachment startup. Raw bootstrap is
   transport setup, not authorization; existing RPC definition, claims, artifact
   and version checks remain authoritative.
3. Extend `makeWorkerConnections` to manage the retained host and lazy owner
   acquisition. Each family supplies its existing runtime/API construction and
   ordered close behavior. Add one internal `acquireWorkerPort` procedure for the
   common lock/bootstrap acquisition used by exactly the three family connectors.
   Keep the synchronous application worker factory signature and exported family
   factory return shapes unchanged. Add no public input, named type, forwarding
   wrapper, barrel or application lifecycle API.
4. Last-client loss starts cleanup immediately. An arrival after cleanup starts
   waits for complete closure, then receives a new owner. Do not add an idle grace
   period, periodic heartbeat, polling, lock stealing or a second owner cache.
5. If cleanup fails, attempt the remaining independent resource releases, retain
   the first failure and keep the host closed to replacement acquisition. Retain
   the namespace lease when any prerequisite cleanup fails. Reject waiting and
   later bootstrap clients promptly with the existing normalized release-failure
   boundary; expose no private causes/stacks. Browser termination can ultimately
   release the failed host's resources. Do not treat an uncertain close as success.
6. Keep hidden, frozen and cached clients attached. Visibility changes alone
   cannot prove that a client is gone. Add no `pagehide`/freeze detachment or
   resume/reconnect mechanism in this plan.

## Planned files

Legend: `+` create; `~` modify. Release-managed versions and skill metadata change
through the existing fixed-group release workflow. Documentation changes follow
implementation and describe its actual result.

```text
zerospin/
  packages/browser/src/
    Node/
      + acquireWorkerPort.ts
      ~ makeWorkerConnections.ts
      ~ closeNodeStorageOwner.ts
      ~ nodeExecution.ts
      ~ openNodeStorage.ts
    AggregateNode/
      ~ connectAggregateNode.ts
      ~ makeAggregateSharedWorker.ts
      ~ makeAggregateWorkerRuntime.ts
    ServiceNode/
      ~ connectServiceNode.ts
      ~ makeServiceSharedWorker.ts
      ~ makeServiceWorkerRuntime.ts
    StandaloneNode/
      ~ connectStandaloneNode.ts
      ~ makeStandaloneSharedWorker.ts
      ~ makeStandaloneWorkerRuntime.ts
      ~ StandaloneSharedWorkerApi.ts
      ~ ready/ready.ts
    makeBrowserSession/
      ~ README.md
  packages/browser/skills/zerospin-browser-sessions/
    ~ SKILL.md
    ~ references/instance-inputs-and-worker.md
  wiki/
    + archive/plans/248-plan-sharedworker-owner-cleanup.md
    ~ glossary.md
    ~ adrs/004-standalone-authority-and-storage-scope.md
    architecture/browser/
      ~ StandaloneSharedWorkerExecution.md
      ~ bootstrapBrowserSession.md
qrk.sh/
  apps/
    ~ app/package.json
    ~ app/README.md
    ~ api/package.json
    ~ library/package.json
    ~ library/README.md
    ~ scraper/package.json
    ~ zerospin/package.json
    ~ zerospin/README.md
  ~ pnpm-lock.yaml
```

## Implementation

1. Implement `acquireWorkerPort` as the common transport acquisition boundary.
   Use inline shapes and runtime Effect Schema validation for its small raw
   bootstrap protocol. Import its protocol declarations directly from their
   defining module in the host; add no re-export module.
   1. Generate a unique client ID and hold an exclusive document-owned lock such
      as `zerospin:worker-client:${clientId}`. Resolve the lock callback's held
      promise to release it; aborting a request alone does not release a held lock.
   2. Construct the SharedWorker through the existing factory, install startup
      error/abort listeners, and send the first raw bootstrap frame.
   3. Await a validated acceptance frame before constructing the tab's CapnWeb
      session. The host installs its CapnWeb handler before sending acceptance.
      This ordering prevents RPC messages from disappearing while cleanup is
      pending. Remove bootstrap listeners before handing the port to CapnWeb.
   4. Return the worker/port and idempotent client-lock release to the connector.
      Every failed acquisition, abort, startup timeout, transport break and
      explicit disposal closes the port and releases the lock. Remove temporary
      listeners/timers and settle outstanding lock requests on every path.
   5. Include bootstrap in each connector's existing 15-second startup deadline
      without restarting it per phase. Aggregate and Service retain their current
      deadline ending after `ready()`; their existing authentication/socket
      deadlines govern attachment. Standalone retains its deadline through the
      first usable view. Preserve artifact/version checks, terminal reporting and
      local disposal semantics.

   Annotated protocol example; these are internal transport frames, not new
   session inputs or persisted fields:

   ```ts
   // 1. The page already holds zerospin:worker-client:${clientId}.
   port.postMessage({ type: "zerospin-client", clientId });
   // 2. The host validates the frame and queues a watcher for that held lock.
   // 3. After any prior owner closes, it installs this owner's RPC handler.
   port.postMessage({ type: "zerospin-client-accepted", clientId });
   // 4. Only then does the page construct CapnWeb and call the existing ready().
   ```

2. Separate host and owner lifetime inside `makeWorkerConnections`.
   1. Keep one global `connect` listener with no eager runtime or namespace lease.
      An unbootstrapped port cannot open or retain an owner. Give it a single
      15-second bootstrap timeout, then close it; this is not a heartbeat.
   2. Strictly validate the initial frame and reject duplicate live client IDs.
      Register an abortable exclusive waiter for the client's already-held lock
      before owner acquisition or readiness. Its acquisition means that the
      document released the lock, so detach that client and return immediately.
      Never hold this watcher lock while awaiting cleanup or reconnection.
   3. Count valid clients through namespace waits and partial initialization.
      Acquire the family owner lazily and install its per-port API. Supply a
      close/cancel handle before awaiting readiness so last-client loss cancels
      pending namespace acquisition and initialization instead of waiting forever.
      Clean up partial construction if acquisition throws.
   4. Funnel RPC breakage, client-lock release and startup failure through one
      idempotent per-port detach path. Revoke the port API and its attachments,
      cancel its watcher and remove it from its owner's clients exactly once.
      One departing client must not disturb another client's owner.
   5. On the last detach, fence that owner and latch its close promise. Queue
      later valid ports without attaching them to the retiring owner. After
      closure, recheck queued clients' liveness before creating a replacement;
      a client lost during drainage must not resurrect an unused owner.
   6. On successful closure, discard the old runtime and reopen lazily for the
      next live client. Never reuse a runtime after close. On failure, reject
      every queued bootstrap promptly and reject later arrivals without opening
      resources. Preserve the first failure rather than leaving silent ports.
   7. Keep explicit host shutdown permanent and idempotent as today. It revokes
      all current/queued ports and closes the owner. Ordinary idle owner cleanup
      never removes the global listener or calls the host's permanent close path.

3. Move each family's namespace/runtime construction into the owner factory
   supplied to `makeWorkerConnections`. Keep family behavior in its current module.
   The proposed internal shape below illustrates Aggregate ownership; the Service
   and Standalone factories supply their existing family-specific equivalents.

   ```ts
   // 1. Register a reusable host. No lease or runtime is acquired at registration.
   const connections = makeWorkerConnections(() => {
     // 2. One client group acquires one fresh closeable owner.
     const namespace = makeNodeNamespaceLease(props.name);
     const runtime = makeAggregateWorkerRuntime({
       sessionKey: props.sessionKey,
       executions: props.executions,
       ownership: namespace.ready,
       openStorage: ({ create, signal }) =>
         openNodeStorage({
           namespace: props.name,
           sqliteWasmUrl: props.sqliteWasmUrl,
           create,
           signal,
         }),
     });
     return {
       createApi: () => new AggregateSharedWorkerApi(runtime),
       close: (connections: { close(): void }) => {
         // 3. Cancel pending ownership before draining partial or active work.
         namespace.preventOpening();
         // 4. Close this owner; keep the host listener and future clients alive.
         return closeNodeStorageOwner({
           connections,
           storage: runtime,
           namespace,
         });
       },
     };
   });
   ```

4. Preserve ordered cleanup and storage exclusion.
   1. Fence new attachment/execution and cancel initialization, remote waits,
      synchronization scopes, sockets and timers. Join accepted local execution
      and SQL work through the current runtime/Node gates. Close the Node and
      derived view, dispose application resources and close SQLite/VFS before
      releasing the namespace lease.
   2. Continue independent cleanup after a failure and report the first error.
      Change `closeNodeStorageOwner`'s unconditional final namespace release:
      call `namespace.close()` only after prerequisite cleanup succeeds. The
      conservative failed-owner path retains its namespace and admits no new
      owner. Preserve behavior of callers that supply no namespace.
   3. Do not wait for remote command finalization or delivery before idle cleanup.
      Preserve committed command state and existing restart/replay behavior.
      Browser/process termination may interrupt asynchronous drainage; promise
      recovery only from already committed durable state.
   4. Carry the existing initialization AbortSignal into authored ManagedRuntime
      layer acquisition and Standalone storage opening. Retain partial-initialization
      cleanup failures separately from the original startup error, including native
      SQLite/VFS opening cleanup. Owner close joins those failures and retains the
      namespace; another attachment cannot reopen uncertain state.

5. Align Standalone readiness with namespace ownership. Pass its owner readiness
   into the existing API/`ready` program and await it before replying with
   artifact/version identity. Add the same ownership-loss observation used by
   connected families, using `/zerospin/standalone/${key}:lifetime`, not the
   build-qualified worker name. Register it only after readiness proves the
   exclusive owner holds that lease. Keep the watcher callback synchronous and
   abort it on local disposal. Do not change storage-key derivation.

6. After implementation, reconcile documentation with observed behavior. Update
   the browser session README/skill, both browser workflow pages and QRK Library
   guidance. Clarify local disposal versus asynchronous shared-owner cleanup and
   the same-namespace upgrade wait. Reconcile the existing glossary and amend
   [ADR 004](../../adrs/004-standalone-authority-and-storage-scope.md) to describe the
   implemented owner lifetime. Create a further ADR only if an implemented
   decision is hard to reverse, surprising without context and a real trade-off.
   Do not change glossary/ADR records during planning.

## Annotated behavior examples

```text
A connects                  -> host creates owner 1; A holds client lock A
B connects                  -> same owner 1; B holds independent client lock B
A disposes                  -> revoke A; owner 1 and B remain usable
B's document dies           -> browser releases B's lock; host closes owner 1
C arrives during drainage   -> validate/watch C; wait without attaching to owner 1
owner 1 closes SQLite/VFS   -> release namespace lease last
C is still live             -> create owner 2; reopen the same persisted database
C's loss was observed       -> discard C before opening the next owner
loss notification is late   -> cancel the cold partial owner without opening SQL
```

```text
last client leaves during namespace wait -> cancel wait; no late database opening
last client hides/freezes                -> retain live client and owner
resource closure fails                  -> finish independent cleanup; retain lease
client arrives at failed host           -> prompt normalized rejection; no replacement
same namespace, new application build    -> new owner waits for old owner's full close
different Plan 247 session lock          -> independent namespace, as already implemented
```

## Verification and acceptance

1. Use existing public session interfaces, built worker modules and disposable
   browser/protocol observations. Add no test files, fixtures, runners, new check
   gates or backend integration suite. Do not verify Explorer. Use the smallest
   observations covering these ownership transitions across all three families;
   use the actual Library flow for persistent Standalone behavior.
2. Prove two clients share one owner, disposing one leaves the other usable, and
   losing the last client closes runtime/Node, sockets, SQLite/VFS and namespace.
   Cover both explicit disposal and document loss without a cooperative CapnWeb
   close frame. A resolved local dispose alone is not proof of owner closure.
3. Observe cancellation before bootstrap, while namespace acquisition is blocked,
   and during partial initialization. Unbootstrapped/dead ports must neither keep
   resources alive nor open storage later. Repeated release must be harmless.
4. Observe immediate replacement/reinitialization, including a React remount and
   an arrival during drainage. Only one owner may exist; a live arrival waits and
   opens a fresh owner after close. Recheck observed client loss before acquiring
   an owner; a late browser notification cancels any cold partial owner without
   opening storage. A cleanup failure must reject queued/new clients and retain exclusion.
5. Preserve definition/claims, artifact and version rejection behavior. Confirm
   Standalone ownership-loss reporting uses the actual physical namespace.
   Confirm hidden/frozen retained documents do not trigger idle cleanup merely
   through visibility changes; record actual browser behavior separately from
   source-level reasoning about BFCache.
6. In Library, record the current namespace and read-only retained data before
   cleanup. Close/reopen through the new host, then reload and observe the same
   database/data. Demonstrate that a later build using that same namespace can
   acquire it once the previous clients leave. Check actual namespace and storage
   release; never delete or reset storage to make the check pass.
7. Run existing scoped producer browser build/type/lint tasks and required release
   dependency builds. Run available QRK App and Library builds. Record compilation,
   transient protocol observations and real browser observations separately; none
   substitutes for another. Do not add unrelated fixes to satisfy these checks.

## Delivery and rollout

1. Implement from committed development-line code in an isolated upstream
   checkout. Preserve unrelated upstream and QRK WIP. The upstream Intent command
   and old referenced `spec` skill were unavailable during planning; QRK's installed
   browser-session skill was loaded, and the local `grill-me` planning guidance
   supplied the document conventions. Install no replacement tooling.
2. Publish a breaking fixed-group release through the existing local registry
   workflow. Verify registry/release state at implementation time and choose the
   next available major; the planning baseline is `18.0.0`. Read back published
   versions and verify the installed browser package implementation.
3. Update QRK's existing exact Zerospin pins and lockfile consistently, with only
   required consumer adoption and current-version documentation changes. Keep
   Library's authored backup path and session identity configuration.
4. Existing pre-cleanup SharedWorker code cannot acquire this behavior
   retroactively. First adoption may still require releasing those old hosts,
   including a browser restart preserving its profile when necessary. No old
   database lookup, deletion, migration, reset or lock stealing is authorized.
   Subsequent versions use the new last-client cleanup for the same namespace.
5. Keep this plan active through upstream publication, QRK installation and the
   required checks/browser evidence. Record release, installation, compilation
   and runtime results separately; archive only when no required work remains.
   Deployment and unrelated sibling adoption are outside this plan.

## Evidence

1. Implemented reusable hosts, document-owned client locks, strict raw bootstrap,
   lazy family owner acquisition, serialized cleanup/reopen and conservative
   namespace retention after cleanup failure. Added cancellation and retained
   failure reporting at partial initialization seams discovered during review.
2. Scoped producer browser library/type/lint graph passed all 12 tasks. Nx Cloud's
   existing remote 401 warning did not affect local task success.
3. Registry inspection found highest major 18, with latest `18.0.0`. Published
   all nineteen fixed-group packages as `19.0.0` through the existing local
   registry at `http://127.0.0.1:4873/`. Read back each version, `latest` tag and
   tarball integrity; all matched the release.
4. Inline observations with native Node 24 Web Locks, MessagePorts and built
   CapnWeb interfaces passed sharing, idempotent release, malformed/duplicate
   bootstrap rejection, last-client cleanup, queued reopening, dead queued-client
   cancellation and failed-close rejection with namespace retention. Actual
   Aggregate, Service and Standalone factories passed lazy ownership, two-client
   sharing, readiness fencing, host reuse and blocked-namespace cancellation.
   These used readiness RPC only; no SQL, attachment or backend flow was exercised.
5. A real Effect 4 ManagedRuntime observation confirmed that pending layer
   acquisition rejects on AbortSignal and disposes/finalizes its scoped build.
   Cleanup-helper observations confirmed remaining stages run after failure, the
   first error survives, and namespace release follows storage only on success.
6. The versioned fixed-group library graph passed all 18 build tasks. All nineteen
   registry packages were still at major 18 before release. Architecture source
   hashes matched all 32 cited entries after formatting.
7. QRK installed all 28 existing exact Zerospin pins at `19.0.0` across its five
   consuming manifests and lockfile. Manifest changes against the captured WIP
   baseline were limited to those version values. All seventeen changed installed
   browser source files matched producer bytes. The installed SharedWorker
   runtime SHA-256 was
   `f724ace72a1e7283baff4062ab4fadb9a15a80b8cbaf80df1cfe0e97517d62fe`.
   Library's backup path and session definition were retained. QRK's existing
   Intent discovered the eight installed skills at the new version.
8. QRK's existing App `build` and Library `build-storybook` targets passed. These
   compilation results are separate from the runtime observations below; no
   backend integration suite or new test/check files were added.
9. Actual Chrome Library observations used the installed `19.0.0` implementation
   at `https://library.qrk.localhost`. Two documents held distinct client locks
   while sharing one exclusive physical namespace lease. Disposing one facade
   left the other `ready`, with its `wall` query returning `wal_library`.
10. After disposing the last facade, an independent native Web Locks request
    acquired that namespace; a subsequent snapshot had no held or pending locks.
    Reinitializing the facade returned `ready` and the same wall row. The
    namespace owner's browser client ID was unchanged, proving that the host was
    reused after its owner released resources rather than merely replaced by a
    new SharedWorker host.
11. A second worker artifact URL, using the same installed SDK, pure definition,
    authored backup path, claims and seeds, created a distinct host. While the
    first host owned the physical namespace, the second facade stayed
    `initializing` and had one exclusive namespace waiter. Disposing the first
    facade let the distinct host become `ready` against the same database. This
    exercises the same-namespace handoff across worker artifact URLs; it does not
    claim a second SDK version was compiled or installed during the observation.
12. With only that second host's client live, reloading its document without
    calling its facade's `dispose()` caused an independent waiting document to
    acquire the released namespace. The reloaded Library initializer then became
    `ready` and read the same `wal_library`. Calling `initialize()` immediately
    after `dispose()`, before awaiting disposal, also returned the actual facade
    to `ready`. A temporary React root replaced keyed public Library initializers
    synchronously: the old facade was `disposed`, the fresh facade was `ready`,
    and its wall query matched. Unmounting that root disposed both temporary
    facades, leaving the one normal Library facade registered in its document.
13. Read-only IndexedDB snapshots serialized actual ArrayBuffer/typed-array bytes
    before adoption, after installation and after all cleanup/reopen/remount
    observations. Both databases retained version 6, fourteen `blocks` rows and
    one `metadata` row, with identical SHA-256 digests throughout:

    | Database namespace                                                                      | Retained byte digest                                               |
    | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
    | `/zerospin/standalone/a81469a4c03922f52c2838d1813e889bede10d5591dbf8c11646fba36fc5fd2d` | `32b9d1fa97347ac0fcc73fc34689bfcb368a45adc32aeb2b0484d37512c89ba0` |
    | `/zerospin/standalone/c2ea158c922a0b01663c1471b099356a4d9f1606912315e90f5304e4222003fc` | `7bfc730c9855bd3ed81d046c7909e93f8cbeadc649298e6cc3bc517cccd88cdb` |

    No database lookup fallback, reset, deletion, migration or authored command
    was used. Both normal Library documents were restored to their existing
    route with developer tools closed. Temporary React/inspection resources were
    released. Browser evidence is retained locally in
    `/tmp/plan248-browser-evidence.json` and `/tmp/plan248-library-verified.png`.

14. Source review confirmed all family artifact/version checks, connected
    definition/admission validation, Standalone claims decoding and independent
    path/full-lock key recomputation remain intact. The ownership-loss watcher
    uses the physical Standalone namespace. Client liveness depends on the held
    lock and RPC loss, with no visibility/freeze/pagehide expiry; a retained lock
    therefore retains its client regardless of document visibility. In the
    instrumented Chrome session, tab switching left `document.visibilityState`
    as `visible`; actual hidden/frozen/BFCache scheduling was not observed. The
    retained-lock policy is source-verified, not a claim of browser BFCache
    eligibility or observed freezing.
15. Implementation commit `78c0c3bf47` was fast-forwarded from the isolated
    committed development-line checkout into upstream `main`. All sixteen
    unrelated upstream WIP files were preserved; Studio's manifest retained its
    authored script and received only the required release version change.
    QRK's concurrent commits and unrelated App README/story edits were retained.

## Remaining work

None.
