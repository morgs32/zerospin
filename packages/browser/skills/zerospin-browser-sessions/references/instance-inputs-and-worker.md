# Instance inputs and worker wiring

This reference applies when constructing a new session family or supplying its
SharedWorker entrypoint. The pure definition retains domain declarations. Constructors receive host wiring,
application layers, identity and seed inputs separately.

| Constructor                      | Inputs beside the pure `definition`                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `makeConnectedAggregateSession`  | `sharedWorkerUrl`, `credentialsSchema`, `layer`, `aggregateId`, `getCredentials`, optional `expectedClaims`    |
| `makeConnectedServiceSession`    | `sharedWorkerUrl`, `layer`; `credentialsSchema`/`getCredentials`/optional `expectedClaims`, otherwise `claims` |
| `makeStandaloneAggregateSession` | `sharedWorkerUrl`, `claims`, `backupPath`, optional `resources`, and `layer` when required                     |
| `makeMockAggregateSession`       | `claims`, optional `resources`, and `layer` when required; no transport                                        |
| `makeMockServiceSession`         | `claims`, optional `resources`, and `layer` when required; no transport                                        |

Agent constructors instead take their independent `agentRelease`, bootstrap
capability and application layer. `makeAggregateAgentSession` also requires
`aggregateId`; both Agent constructors accept an optional `sqliteModuleFactory`.
Agent name and version come from the Node definition, not separate inputs.

Credential providers return `Effect.Effect<Credentials, IAnyError>` with no
unprovided services. A captured provider may obtain a refreshed token; it cannot
replace the instance's authenticated claims. Anonymous credentials can be valid
for an actor expressly designed for guests. A browser-generated identifier does
not establish authenticated account ownership. The aggregate ID selects the
aggregate instance; a model row ID selects a resource inside it.

Connected Aggregate and Service persistence is keyed by the complete authenticated
`sessionKey`: `/zerospin/aggregate/${sessionKey}` and
`/zerospin/service/${sessionKey}`. Their discovery stores are
`zerospin:aggregate:discovery` and `zerospin:service:discovery`.
`sharedWorkerVersion` still selects executable routing and handshake identity,
not the connected database or lease. Different runtime executables serialize on
that lease, so an update can wait or time out while an older runtime's tab remains
open. Same-executable tabs continue sharing the usual Node. Expiring the bounded
namespace wait reports `node-storage-owner-busy` without replacing storage.
The existing readiness/error path supplies its message; close other documents
using this app and retry with a fresh facade. The failure establishes contention,
not the identity or continued presence of another document.

Connected Aggregate and Service Nodes validate the exact binding, durable
schema and immutable migration history under the lease. A meaning-preserving
change applies to a pending command offline. Its SQL and ledger entry commit
together. Reconnect sends the same original when pushing is enabled. A
journal-only command is recovered through its original producer and session
coordinates. Unknown histories and unsupported pending prerequisites preserve
the file for a compatible runtime.

The original adoption of stable session-key files required draining work in
pre-baseline runtime-hash files with their compatible clients. An authenticated
local development clean selects its successor file under the same lease.
Standalone and Native retain their own storage policies.

Standalone `backupPath` uses a `RoutePattern` whose parameters name string or
number fields in the claims schema. Authored aggregate/Actor versions, session
name, resolved backup path and the complete canonical `aggregateSessionLock`
select one worker name, database namespace and namespace lease. Changes to locked
models, public contracts or the claims schema open another partition; returning
to the same scope, path and lock reopens its retained data. Incidental claims
values outside the resolved path and runtime/build identity are excluded. Builds
using the same namespace wait for its current owner; different lock partitions
can initialize independently.

Aggregate, Service and Standalone hosts acquire their Node/SQLite/VFS,
synchronization and namespace owner lazily after raw port bootstrap. A unique
document-owned Web Lock covers each connection, including startup; its release
detects document loss without relying on an RPC close frame. This lock is
separate from the worker's exclusive namespace lease. Hidden, frozen and cached
documents remain clients while the browser retains their locks. Consumer code
needs no visibility handlers, heartbeat or explicit worker shutdown.

Disposing one client leaves other clients usable. Last-client departure starts
ordered owner cleanup; the retained host queues arrivals until closure and then
creates a fresh owner over the same database. `session.dispose()` waits for its
facade's local cleanup, not for that shared-owner drainage. A cleanup failure
retains namespace exclusion and rejects waiting/later clients. It never opens a
replacement over uncertain resources. Standalone `ready()` awaits namespace
ownership, and its connector watches that physical namespace for ownership loss.
Existing workers running older code need their old owner released once; a browser
restart preserving its profile can release it without deleting storage. This
cleanup change does not change keys, seeds or stored rows.

`resources` contains rows for the definition's declared models. Fresh partitions
initialize from these captured seeds. First adoption of lock-based partitioning
changes every prior standalone key; old databases remain untouched, with no
lookup, migration, deletion or fallback. `session.reset()` rebuilds only the
current definition's partition using captured claims and seed rows; it does not
transfer data between locks. Choose this only when the application's task
requires a reset; it discards that partition's standalone data and retained
history.

For disposable local documents, constructor inputs may set
`discardUnrestorable: true` (default false). Attachment may reset once per
standalone owner for these retained-data validation codes:
`node-metadata-missing`, `node-metadata-ambiguous`,
`node-execution-checkpoint-invalid`, `node-resource-invalid`,
`node-resource-date-invalid`, `node-resource-model-invalid`,
`node-command-input-missing`, `node-command-final-missing`,
`node-command-contract-mismatch`, and `node-storage-incomplete`.
Seeds and partition identity are validated before replacement. Existing clients
acknowledge reset, then the owner rechecks the document so a concurrent repair is
preserved. Generic defects, environment/access failures, and identity mismatch
do not authorize discard; a replacement failure is terminal rather than a loop.
The option is passed through `useStandaloneAggregateSession`; managed readiness
and errors describe the result. Do not delete application IndexedDB or rotate
backup paths to imitate this recovery.

After successful automatic replacement and snapshot validation, each affected live
connection receives `standalone-state-reset` as a nonterminal recovery notice. It
uses the existing session store (`origin: 'recovery'`) and managed `onFailure`
observer, including cold startup before snapshot subscription. Existing automatic
incompatible-storage replacement reports the same notice. Notification cannot
delay recovery, and later healthy attachments receive no historical notice.
Concurrent repair that preserves the document, replacement failure, and explicit
`session.reset()` emit no reset-success notice. No public `onReset` callback exists.

```text
same scope + resolved path + lock A -> reopen partition A
same scope + resolved path + lock B -> seed separate partition B
return to lock A                    -> reopen A without merging B
```

For aggregate, service and standalone definitions, the owning scope and application
SharedWorker import the same pure session definition. Worker registrations include the
executable contracts, not only model schemas or serializable locks. Supply any
additional contract execution services in that registration's `layer`.

With Vite, the owning scope supplies a bundled worker URL directly:

```ts
import { makeConnectedAggregateSession } from '@zerospin/browser/makeConnectedAggregateSession';
import nodeWorkerUrl from './node.worker?sharedworker&url';
import { shopperSessionDefinition } from './shopperSessionDefinition';
import { applicationLayer } from './applicationLayer';
import { credentialsSchema } from './claims';

const shopper = makeConnectedAggregateSession({
  definition: shopperSessionDefinition,
  credentialsSchema,
  layer: applicationLayer,
  sharedWorkerUrl: nodeWorkerUrl,
  aggregateId: shopperId,
  getCredentials,
});
await shopper.initialize();
// Dispose with the owning scope; do not export a live module-level facade.
await shopper.dispose();
```

Each session has its own worker entry. The entry registers that one definition:

```ts title="src/shopper.worker.ts"
/// <reference types="vite/client" />
import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';
import { shopperSessionDefinition } from './shopperSessionDefinition';
import { workerLayer } from './workerLayer';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: shopperSessionDefinition,
  layer: workerLayer,
});
```

`workerLayer` supplies only services needed for contract execution in the worker.
Omit `layer` when the session definition requires no additional execution
services. Keep host-only services out of this layer. The worker name selects
aggregate, service, or standalone execution, and it must match the definition.

`makeMockAggregateSession` and `makeMockServiceSession` accept their pure definition,
decoded claims and optional complete resource seeds, without worker or API wiring.
Their `layer` is required when replay needs services beyond the built-in runtime.
Supplied services remain available through the returned session's typed execution
methods. Initialize and dispose each mock facade with its owning UI lifetime.

A standalone session uses the same single `sessionDefinition` in its own worker
entry. The worker name's standalone kind selects that runtime. Host configuration does
not install worker programs by itself. Keep credentials, API configuration,
notifications and other host-only wiring outside these session definition files.

The `?sharedworker&url` and `?url` imports use Vite's bundler handling. Pass that
worker URL string as `sharedWorkerUrl`. Connection resolves it against the page
and opens a module SharedWorker, then checks that URL against the running worker.
Other bundlers must emit an executable module worker URL and served SQLite WASM;
a generic raw TypeScript asset URL is insufficient. Keep worker/WASM assets from
the same installed browser package. Aggregate agent sessions instead use their
supplied `bootstrap`.

For connected sign-out, `clearAuthentication()` clears retained Node authentication
and discovery state and detaches that worker's attachments. It is broader than
closing one view. Ordinary view replacement calls `dispose()`.

Source basis: `packages/browser/src/index.ts`,
`browserSession/types.ts`, `browserSession/makeCredentialsAdmissionProvider.ts`,
`browserSession/makeServiceAdmissionProvider.ts`, `makeSharedWorker.ts`,
`AggregateNode/makeAggregateWorkerRuntime.ts`, and the Tic Tac Toe worker example.

## Managed React ownership

React uses the corresponding concrete `use*Session(definition, optionsOrResolver)`
hook with these same host/instance inputs, omitting `definition` from options.
The returned handle is published through `SessionProvider`. `SessionReady` gates
readers and commands; `useSession(definition)` reads the ready facade. The hook
owns generation replacement, disabled inputs, retry and release; no application
persistence or transport waiter is part of this interface.
