# Native aggregate sessions

## iPhone System host

`createNativeSystem` hosts one authored Aggregate release with ordinary
contracts explicitly granted by that release's `system` map. It preserves the
Aggregate's admitted commands, evaluated history, `outcome`, resources, and
`dispositionChainHash` through the authoritative Aggregate transactions. The
System can have multiple Aggregate IDs. Services, Actors, Agents, external
contracts, emitted commands, and external operations are not supported.

Package inspection checks the authored declarations but cannot determine all
Effect services a contract program might request: those requirements are
erased at runtime and can depend on the input. The native System host provides
the `System` service, not the application's managed runtime or application
services. If a program requires another service, execution fails without a
fabricated terminal `outcome`; the admitted command remains pending and later
recovery retries it. Initialization reports the blocked Aggregate and its
admitted command; other Aggregate IDs remain usable. A snapshot reports the
last committed resources together with the pending failure, and the blocked
Aggregate refuses new admissions. The current host does not provide a way to
replace that System package or resolve an incompatible pending program.

The Swift `SystemRuntime` inspects a candidate without storage or network
access. Opening existing storage first validates an isolated copy while holding
the original directory's ownership lock. Keep the lock through activation;
SQLite may create WAL sidecars even during a read-only open.

`@zerospin/native` ships a JavaScript entry and a Swift package at `swift/`. Bundle the app's JavaScript entry as an IIFE named `ZerospinApp`, include it as an app resource, and add the installed `swift/` directory as a local package dependency in Xcode. The Swift package includes its JavaScriptCore bootstrap.

[`makeNativeStandaloneSession`](src/makeNativeStandaloneSession.ts) runs ordinary Aggregate contracts on-device. A new store starts at the local genesis checkpoint. The session journals each submitted command, delivers it to the local AggregateNode, and returns the terminal resolution together with committed resources. Initialization settles retained commands before returning the first snapshot. It requires a standalone session definition and a fixed Aggregate ID. Each session uses its own storage directory.

Swift's [`StandaloneSession`](../swift/Sources/Zerospin/StandaloneSession.swift) loads the app bundle with `initialize`. The app entry exports `initialize`, `submit`, and `dispose`. `submit` returns the command result and snapshot together. The Swift caller uses `execute` and reads the updated `snapshotJSON`. The directory lease covers Node and session SQLite files for the session lifetime.

## Connected sessions

[`makeNativeSession`](src/makeNativeSession.ts) accepts aggregate session definitions whose
programs do not require additional application services. Its promise resolves with
initialized session controls.

`makeNativeSession` composes the checked session definition, AggregateNode and a local session replica inside JavaScriptCore. Swift supplies synchronous SQLite, networking, crypto, timers and serialized execution. AggregateNode retains shared original/final history and authoritative resources in its Node file. Its derived optimistic resource graph uses a host SQLite `:memory:` connection, with no WASM dependency or extra persistent file.

The session file keeps one ten-column row per locally staged sessionIndex and five-column sessionMetadata. Metadata retains sessionId, transactional lastSessionIndex allocation, installed Node prefix and the Aggregate checkpoint pair. A Node retention reply contains sessionId/sessionIndex/nodeId/nodeIndex/pushIndex; canonical command ID derives from nodeId/pushIndex once allocated. Coherent view installation transfers optimistic ownership atomically, applies compact final resolutions to the matching local submission and replays only uncovered local originals. Original payload/stagingOutcome remain for the replica lifetime. No Node phase importer or duplicate shared history remains in the session file.

Browser authentication, HTTP batches and JSON WebSocket synchronization remain in use. Native supplies a direct Node subscription rather than a SharedWorker. The Node and replica have separate durable files and exact identity binding; the directory lease still covers both. A synchronous local staging result establishes neither AggregateChain admission nor authoritative finalization. Lost replies recover by comparing complete original input with retained Node evidence.

The [Native Node SQLite adapter](src/openAggregateNativeNodeOwner.ts) uses
`durableSQLiteCodecs`, matching Browser Node storage. Drizzle restores JSON and
boolean columns to their typed values before retained-command reconstruction and
Node state publication. Native model tables use the same row shape as Core:
authored attributes plus `id`, `createdAt` and `updatedAt`. Direct model-table
selects retain encoded JSON strings; relational queries decode JSON values.
Native snapshot export calls `makeResourceFromEncodedRow` to validate and restore
the bound `modelName` and `version` without rewriting encoded JSON bytes.

SQLite observers receive settled table-change batches. The private Swift flush bridge
returns `null` during an active transaction and an array after settlement; an empty
array means there are no host changes. TypeScript retains caller-supplied restored
table names until settlement and isolates reentrant listener writes in the next batch.

`pnpm nx run @zerospin/native:lib` builds the JavaScript package and bundles the authored
[host bootstrap](src/host.js) into Swift's generated `Resources/host.bundle.js`.
`pnpm nx run @zerospin/native:build` also bundles the tic-tac-toe entry into
`dist/tic-tac-toe.js`.
The bootstrap bundles its `es-toolkit` record traversal and runs before application
code; it is the single host adaptation asset loaded by JavaScriptCore. The Swift
package loads the application entry as an application resource. Fixed
schema changes require empty storage; native Session storage currently uses SQLite
`user_version = 11`. No migration or fallback decoder is provided.

An initialized identity can stage while offline. A new identity requires its first
server snapshot. Suspend stops network activity; resume restores authentication and
catches up. Clear authentication stops and disposes all loaded example sessions while
retaining journals; explicit initialization with credentials is needed to reopen them.
Disposal is terminal for the Swift `Session` instance.

Swift's public [`Session`](../swift/Sources/Zerospin/Session.swift) provides
`initialize`, `stage`, `suspend`, `resume`, `pushNow`, `clearAuthentication` and
`dispose`, with observable `snapshotJSON`, `failure` and `isInitialized` state.
Concurrent initialization joins only an equal decoded JSON configuration and
standardized bundle URL. Once loaded, the JavaScript bundle URL is fixed for that
Swift lifetime. The tic-tac-toe entry separately binds each opened Aggregate to its
complete decoded configuration; a changed same-Aggregate API, key or claims is
refused for both opening and loaded sessions.

[`decodeAggregateNativeSessionInputs`](src/decodeAggregateNativeSessionInputs.ts)
clones and decodes configuration, decodes claims against the session definition, and validates
the derived Node request before opening either file. The Node owner receives
its request, claims and configuration directly; the replica receives the session definition, claims
and opened owner. File acquisition registers cleanup immediately. The opened Node owner must match the bound session definition, full claims and exact
storage key before replica provisioning. Nonempty replica storage requires the
current fixed schema, metadata presence and a valid retained sessionId. The exact
key owns identity; metadata does not duplicate Origin. Its `lastSessionIndex`
remains the transactional local allocation authority. There is no old-row
translation.

Native Node storage uses shared AggregateNode fixed schema 22. Its seven-column
nodeMetadata retains producer nodeId, aggregate owner ID, exact session key,
admission progress, nullable Aggregate resource position/hash and pushPaused.
Ordinary reads require exactly one row. Reopening checks owner and identity binding
before journal mutation. The durable nodeId is available to authentication before
baseline installation; both resource checkpoint fields remain null until validated
resources and the checkpoint commit atomically. Partial pairs are invalid, while
zero/genesis is a present baseline. Native owner startup and replica acquisition
require the actual checkpoint rather than a stored initialized flag.

AggregateNode snapshots expose derived nodeIndex, pushIndex and outcomeIndex at
the top level beside raw metadata. Append/submission maxima derive from retained
commands inside append transactions; private outcome progress is the first-gap
contiguous original/same-ID-final prefix. Consumers preserve these real progress values without SQL counter copies. The Node's thirteen-column command table retains original sessionId/sessionIndex separately from final id; complete original input reconstructs its canonical ID from the Node allocation. Nonempty older Node or replica storage is refused and must be emptied explicitly. Agent and backend storage are independently owned.

Native passes the same pure session definition to initial staging and Node projection. Original claims, exact contract version, payload bytes and stagingOutcome participate in Node retry equality. The installed Node prefix and authoritative Aggregate checkpoint remain separate facts. A final resolution updates the existing local row even when the exposed delta is empty or private failure is null. Origin-specific notification follows the local transaction. Successful staging or unresolved reconstruction records the originating local submission; Node allocation promotes that marker once. Repeated handoff and suspend/resume cannot recreate a consumed notification marker.

Suspend fences new handoff and joins the current transport attempt. Resume verifies the
same retained identity, reconciles a fresh Node capture and restarts delivery. Clear
authentication withdraws the capability before Node authorization changes. Disposal
shares one terminal promise, cancels local remote waits, stops handoff, drains accepted
Node SQL/delivery, closes the replica and Node files, and releases application execution.
Every acquired cleanup is attempted even when an earlier phase fails. Swift destroys its
context and releases the directory lease after JavaScript completes that drain.

`@zerospin/native:ts` uses the real existing native build and workspace dependencies;
`tsc:typecheck` is disabled and is not verification. The Swift build verifies compilation.
[Plan 234](../../wiki/archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md)
records passing public Swift `Session` checks on macOS with Swift 6.4, Xcode 27.1,
JavaScriptCore and real SQLite. They cover checkpoint-zero startup, canonical
admission and final exposure, suspend/resume, exact configuration and bundle
binding, directory exclusion, authentication clearing, disposal/reopening with
identical retained Node/replica rows, interrupted initialization, and incompatible
nonempty schema refusal without mutation. This is host-runtime evidence; it does
not establish iOS application/UI behavior or recovery from an OS process crash.
