# Zerospin Swift host

Swift 6, iOS 17+ / macOS 14+. Add this local package's `Zerospin` product to an app,
bundle the JavaScript entry produced by `@zerospin/native`, then create a
`@MainActor Session(storageDirectory:)`. Pass a configuration JSON object containing
`apiUrl`, `publishableKey`, `aggregateId`, `claims`, and `credentials` to `initialize`.
Use `stage(contractName:payloadJSON:)` for contracts and observe `snapshotJSON`.
Contract failures return a `Failure` result; host failures throw.

The host confines JavaScriptCore, SQLite connections, and all network callbacks to
one serial executor. SQLite uses WAL and FULL synchronous commits. JavaScript owns
contract execution and synchronization; the SwiftUI layer only renders state and
forwards intent. Host Web APIs cover the bundled session's needs, rather than a
complete browser DOM. An OS file lock enforces one live runtime owner per storage directory.

Call `suspend` when leaving the foreground, `resume` on return, and `dispose` before
releasing the runtime. iOS may terminate the app without these hooks: recovery uses
the retained journals. Background execution is not promised. Backend O continues
independently after admission.

`Session.initialize` owns one load task and one current initialization task. Concurrent
callers join initialization instead of loading a replacement JavaScript context. A failed
executor load is terminal; a loaded application's initialization failure can retry. The
session captures its lifetime identity when queuing publication and checks it again on
the MainActor. Closing immediately withdraws publication and initialized state, so a
previously queued snapshot cannot restore them.

`dispose` is idempotent and joins the same disposal task. It cancels initialization,
awaits owned loading, invokes JavaScript disposal to cancel opaque local network waits
and drain accepted SQLite work, then always tears down the executor. A JavaScript cleanup failure is retained in
`failure` after teardown. Host teardown
cancels fetches, sockets, timers and pending replies, closes SQLite and releases the
existing directory flock. A raw handle from a failed SQLite open or PRAGMA closes
before entering the retained connection map. The host supplies `Promise.withResolvers`
for the shared TypeScript lifetime, Node and transport owners.

The authored host bootstrap lives in [`packages/native/src/host.js`](../native/src/host.js).
The existing native build bundles its platform bindings and `es-toolkit` traversal
into the generated `Resources/host.bundle.js` resource. JavaScriptExecutor loads this
single compiled bootstrap before the application entry; no second authored resource
or module loader is retained.

Run `pnpm nx run zerospin-swift:build` for the actual Swift compiler; its Nx dependency
first runs `@zerospin/native:build` to generate the bootstrap resource. Persistent reopen,
concurrent directory ownership and foreground/background shutdown timing need a
running application; compilation alone supplies no evidence for those cases.
