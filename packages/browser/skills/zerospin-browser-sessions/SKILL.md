---
name: zerospin-browser-sessions
description: >-
  Use when designing, reviewing, or authoring Zerospin session declarations,
  constructing, initializing, disposing, or signing out a browser session,
  choosing its fixed instance inputs, or wiring its SharedWorker.
metadata:
  purpose: Bind an authored definition to an independent live instance and own its identity, readiness, and shutdown.
  type: core
  library: '@zerospin/browser'
  library_version: '42.0.4'
requires:
  - '@zerospin/sdk#zerospin-parallel-models'
---

# Own a browser session

First load `pnpm exec intent load @zerospin/sdk#zerospin-parallel-models` and
apply its model-data invariant throughout this task.

1. Author a pure `makeAggregateSessionDefinition` or `makeServiceSessionDefinition`
   session definition from `@zerospin/browser`. Export one complete checked definition
   per named file, with required `systemName` inside the constructor, exact owner
   and Actor versions, and explicit model and public contract versions imported
   from their defining modules. Do not
   export intermediate `*SessionDefinitionProps` objects, compose definitions through
   shared models/contracts spreads or spreads of another definition, or derive browser declarations from server actors
   or aggregate releases. Both the tab and SharedWorker import the same definition
   directly from its defining module; do not collect definitions in a factory or
   re-export barrel or one-entry session registry. A plain object with `satisfies`
   is not a checked definition. Keep credentials and host-only wiring separate.
   A connected session binds to its exact registered owner and Actor versions.
   That owner release executes the session's admitted commands while `canonical`
   selects the release that supplies adopted published history.
   List exact limited-model instances when exposure is restricted; do not replace
   a limited projection with its full model merely to expand a shared model map.
   See [complete session declarations](#complete-session-declarations) below.
   Pass the pure declaration as `definition` to a concrete constructor. Keep
   `layer`, `sharedWorkerUrl` and credentials settings separate; no host fields or
   connection object are merged into the definition. Use `makeConnectedAggregateSession`,
   `makeConnectedServiceSession`, `makeStandaloneAggregateSession`,
   `makeMockAggregateSession` or `makeMockServiceSession` for the actual execution
   arrangement. Standalone declarations retain `systemName: 'standalone'`.
   Both tab and application worker import the same pure declaration directly.
   Pass the bundler's `?sharedworker&url` import as `sharedWorkerUrl`; the
   worker registers pure declarations through `makeSharedWorker` with its own
   execution layer. Keep host-only imports out of that graph.
2. Construct each independent owner with
   the concrete constructor with `{ definition, layer, ...hostAndInstanceInputs }`. Construction is cold. Aggregate selection, claims,
   expected claims, seed resources and backup path remain fixed. Create another
   instance to change identity. Connected `getCredentials` returns an Effect
   that acquires fresh credentials; `expectedClaims` asserts server admission
   identity, without authenticating it. First authenticated full claims remain
   fixed even across disposal/reinitialization.
   Connected browser storage and discovery use the complete authenticated
   `sessionKey` independently of the compiled runtime hash. Executable routing
   and artifact checks remain versioned. First adoption of this migration-aware
   baseline requires draining pending work and retiring pre-baseline runtimes;
   old runtime-hash stores remain untouched and are not adopted automatically.
   Standalone persistence is partitioned by authored owner/actor versions,
   session name, resolved backup path and the complete canonical session lock.
   Changed locked model, contract or claims-schema facts select fresh storage;
   the same scope, path and lock reopen their retained partition. Incidental
   claims values outside the path and runtime/build identity do not split it.
3. When the browser explicitly reports offline, connected Aggregate/Service
   sessions may reopen one eligible previously verified identity using the exact
   authored definition and expected full claims, without requesting online
   credentials. Existing local models and staging remain available; no partition
   is created offline. A credential deadline may also reopen that same eligible
   local identity without declaring the backend unreachable. Local sign-out
   invalidates eligibility. Synchronization
   acquires fresh credentials and server proof after reconnection before sending
   pending commands; offline access never grants backend authority.

   After a whole local-development System reset, connected browsers verify the
   retained Node's producer registration before delivery. A missing registration
   replaces that Node and discards its pending commands and matching tab journal;
   existing unregistered local-dev Nodes are also replaced on first adoption.
   Ordinary reconnects preserve a matching Node. Remote and production sessions
   do not use this local reset signal, and unavailable authentication or storage
   is not proof of a reset. Application-owned drafts and login state are separate.

   Await `initialize()` before domain commands or model-ID generation. General
   `runSync`/`runPromise` can acquire application services before initialization;
   they do not establish domain readiness. An initialized service can still
   refuse writes with `service-session-not-current`. Duplicate initialization
   throws synchronously.
   A failed facade stays terminal. For an explicit connected transport retry,
   construct a fresh facade and call `initialize({ retryConnection: true })`.
   This one-shot first-attachment option preserves Node identity, checkpoints,
   pending commands and SQLite storage. Fresh authentication must succeed;
   only a closed or timed-out subscription can be unblocked after its old socket
   attempt drains. Storage, projection, checkpoint, authentication and admission
   failures never authorize this transport retry. Connected Aggregate/Service
   retained-state and unexpected startup/synchronization failures instead use
   framework-owned bounded recovery in both production and development. Recovery
   validates a fresh authenticated snapshot, preserves original commands and
   identities where possible, and allows at most one fresh-producer fallback for
   unrecoverable local state. Authentication/network failures preserve storage.
   A new owner/reload rearms recovery; ordinary reconnect/resume does not. A failed
   facade remains terminal and needs a fresh owner.

   A connected Node migrates supported command tables locally under its
   exclusive lease. Pending work and an explicit push pause survive. Ordinary
   synchronization delivers after reconnect when pushing is enabled. Unknown
   history and unsupported pending prerequisites preserve the original database.
   A verified local development clean selects a new file and producer. Old tab
   journals stay with the producer that authored their commands.
   Distinct runtime executables wait for the same lease; do not force-close other
   tabs or bypass their document locks. No author-facing migration callback exists.
   If that bounded namespace wait expires, initialization reports
   `node-storage-owner-busy` through the existing store/readiness error path.
   Storage remains intact. Close other documents using the local session, then
   retry with a fresh facade. The failure does not identify a live document:
   unsuccessful prior-owner cleanup can also keep storage excluded.

   Standalone inputs may opt into `discardUnrestorable: true` for an explicitly
   disposable document. The worker may discard its exact partition once per owner
   for recognized retained-data validation failures after validating captured seeds.
   Existing clients acknowledge reset; recheck after fencing to preserve a repaired
   document. Healthy state, environment/access failures, and identity mismatches
   remain untouched. Replacement failure is terminal, never an application loop.
   Managed readiness/error state carries the result; no managed reset method is added.

   Successful automatic standalone replacement reports `standalone-state-reset`
   through the existing nonterminal `origin: 'recovery'` store path and managed
   `onFailure`. This includes cold/warm opt-in recovery and existing incompatible
   storage replacement, only after the replacement snapshot validates. Keep the
   observer mounted before initialization. Concurrent repair without replacement,
   failed replacement, and explicit manual reset emit no reset-success notice;
   later healthy attachments do not replay an old notice. Add no public `onReset`.

   Credential acquisition is bounded to five seconds per attached provider;
   local discovery/snapshot preparation has a separate five-second deadline.
   The backend snapshot or WebSocket-ticket request owns its ten-second deadline.
   The schema-backed Node failures distinguish credential timeout, local
   preparation timeout, backend timeout, backend unreachable, and no usable
   provider. Preserve their supplied message and validated diagnostics through
   error presentation; never label credential or storage delays as backend
   failures. Concrete backend errors outrank an unavailable frozen provider.

4. Await `dispose()` whenever the owner ends, including interrupted startup.
   It fences readiness immediately and drains the facade's work before local
   resource closure. Its Promise is not acknowledgement of shared-owner closure.
   The last live Aggregate, Service or Standalone client starts asynchronous
   Node, synchronization, SQLite/VFS and namespace cleanup. The SharedWorker host
   remains reusable; an arriving client waits for cleanup before reopening the
   retained database with a fresh owner. Document-owned Web Locks detect abrupt
   client loss independently of namespace exclusion. Hidden or frozen documents
   stay live while the browser retains their locks; add no visibility cleanup.
   Ordinary document reload needs no application flush or async unload protocol.
   Node-retained commands and successfully persisted journal originals recover
   independently of any HTTP service worker or Vite integration. Journal writes
   remain best effort; do not promise recovery of in-memory-only staging or
   failed persistent writes. Application form drafts and uploads are separate.
   Managed React hooks own this lifetime: call a concrete `use*Session(definition,
optionsOrResolver)`, publish its handle through `SessionProvider`, and gate only
   dependent readers with `SessionReady definition={definition}`. Applications
   update identity or disable options without keying public UI or awaiting persistence,
   transport, Node retention or background delivery.
   Initialization failures preserve their original error after cleanup. Reinitializing
   the same facade retains identity and waits for prior shutdown. For deliberate
   connected sign-out, await `clearAuthentication()` before signing out the
   identity provider. Clearing retires the facade and revokes its exact remembered
   identity even before readiness or after failure/disposal. Credential sessions
   need complete `expectedClaims` to revoke before their first authentication.
5. Read lifecycle and errors from the same `session.store`: `status` is `idle`,
   `initializing`, `ready`, `disposed` or `failed`; `failure` is the latest
   reported `IZerospinError` or null. Lazy runtime acquisition alone stays idle.
   Report external errors with `session.reportFailure({ origin: 'session', error })`;
   recognized command reports use command origin and preserve readiness.
   Framework recovery uses nonterminal `origin: 'recovery'` only when local work
   may have been lost or left unconfirmed; successful preservation stays quiet.
   Mount notification subscriptions through loading and recovery so startup
   notices reach the application's existing toast handler. Every
   report publishes a fresh error occurrence, and the first terminal occurrence
   remains pinned. A scoped store subscription can notify on changed failure
   references with `status !== 'failed'`; release it with the host lifetime.
   React `SessionReady` owns local construction/query/render error presentation
   through required `renderError(error, retry)`. Managed hook `{ onFailure }`
   observers receive changed nonterminal occurrences before initialization. Wire
   retry directly so framework ownership releases the failed generation and
   constructs a fresh one.
6. Connected Aggregate and Service sessions accept
   `diagnostics: import.meta.env.DEV` alongside the other host inputs for optional
   startup spans and phase logs in DevTools and the tab console. Aggregate
   diagnostics also retain their existing worker telemetry bridge; Service
   diagnostics are tab-side only. Failed browser connections always emit a bounded
   console diagnostic with the observed reason, current/last-completed phase,
   elapsed time, sanitized module URL and acquisition client ID, independently of
   that option. Inspect the SharedWorker console separately for bootstrap/global
   failures; module imports can fail before framework code executes. Keep
   credentials and model contents out of annotations. Automatic failure records
   use fixed categories and recognized codes; error/stack/cause/event text is not
   copied into them. The diagnostics option does not relax that projection.
   Existing session and React error presentation retain their original failures.
   Reused Nodes report attachment timings, not cold startup.
7. Check existing application types/builds and exercise startup, identity replacement
   and cleanup where an existing runtime route permits. Report unverified lifecycle
   behavior separately from compilation.

Use `stageAggregateSessionCommand` or `stageServiceSessionCommand` for browser
Actor actions. Each synchronously retains its local staging result in the owning
session journal. AggregateNode and ServiceNode retain and deliver the command to
AggregateChain and ServiceChain admission. Observe domain completion through live
queries and report later refusals through the existing session store.

When choosing family inputs or adding worker assets, read
[instance inputs and worker wiring](references/instance-inputs-and-worker.md).

## Complete session declarations

```ts
// gameSessionDefinition.ts: one complete pure declaration, checked at its owner.
import { makeAggregateSessionDefinition } from '@zerospin/browser';
import { createGameV1 } from './contracts/createGameV1';
import { playXV1 } from './contracts/playXV1';
import { claimsSchema, gameV1 } from './gameV1';

export const gameSessionDefinition = makeAggregateSessionDefinition({
  systemName: 'tic-tac-toe',
  sessionName: 'gameSession',
  aggregateName: 'game',
  aggregateVersion: 1,
  actorName: 'human',
  actorVersion: 1,
  models: { game: gameV1 },
  contracts: { createGame: createGameV1, playX: playXV1 },
  claimsSchema,
});
```

The tab and that session's worker entry each import `gameSessionDefinition` directly from
`./gameSessionDefinition`. The worker registers that one definition with `makeSharedWorker`;
the tab supplies its host configuration separately.

```ts
// @bad Split the declaration between an exported props object and this wrapper.
import { makeAggregateSessionDefinition } from '@zerospin/browser';
import { gameSessionDefinitionProps } from './gameSessionDefinitionProps';

export const gameSessionDefinition = makeAggregateSessionDefinition({
  ...gameSessionDefinitionProps,
  systemName: 'tic-tac-toe',
});
```

When replacing this split, move the complete declaration into its owning file,
update direct imports, and delete the props module rather than retaining an alias.

## Complete service declarations

```ts
// catalogSessionDefinition.ts: system binding is checked with the declaration.
import { makeServiceSessionDefinition } from '@zerospin/browser';
import { userClaims } from './claims';
import { productV1 } from './services/marketplace/models/product/ProductV1';

export const catalogSessionDefinition = makeServiceSessionDefinition({
  systemName: 'shopping',
  serviceName: 'marketplace',
  serviceVersion: 1,
  actorName: 'catalog',
  actorVersion: 1,
  sessionName: 'catalogSession',
  claimsSchema: userClaims,
  models: { product: productV1 },
  contracts: {},
});
```

`systemName` is required by both constructors. Do not attach it afterward with
`{ ...makeServiceSessionDefinition(...), systemName }`. The complete frozen result
is shared directly by the tab and worker. Service lock/spec projections remain
context-free; adding the system identity to authoring does not add it to a lock.

```ts
// @bad Registries and reconstruction hide the authored declaration's owner.
export const sessions = { catalog: catalogSessionDefinition };
export const storySessionDefinition = makeAggregateSessionDefinition({
  ...connectedSessionDefinition,
  systemName: 'standalone',
});
```

Give standalone stories their own complete checked declaration and have their
provider and worker import it. Remove superseded registries, forwarding exports,
and unchecked props modules once their callers use the defining module.
