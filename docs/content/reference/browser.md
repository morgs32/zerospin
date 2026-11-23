---
title: Browser sessions and SDK
description: Import browser-safe authoring helpers, construct session definitions, and own a live capability's lifecycle.
order: 2
---

## Browser SDK

```ts
import * as sdk from '@zerospin/sdk/browser';
import {
  makeConnectedAggregateSession,
  makeConnectedServiceSession,
  makeStandaloneAggregateSession,
  makeMockAggregateSession,
  makeMockServiceSession,
} from '@zerospin/browser';
import {
  useConnectedAggregateSession,
  SessionProvider,
  SessionReady,
  useSession,
  useLiveQuery,
} from '@zerospin/react';
```

These are three separate package entry points. `sdk/browser` holds browser-safe domain authoring and staging. `@zerospin/browser` adds session definition construction and browser session ownership. `@zerospin/react` owns React integration. Avoid importing the root SDK, backend system/config modules, or backend external implementations into a browser dependency graph.

The [browser SDK barrel](https://github.com/morgs32/zerospin/blob/main/packages/sdk/src/browser/index.ts) exports the following shared authoring surface; exact inputs are covered in the [root reference](/reference/sdk):

| Task                          | Browser-safe exports                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Models and queries            | `defineModel`, `makeModelVersion`, `upgradeModelVersion`, `makeQueryDbVersion`, `makeId`, `makeIdSchema`, `prefixId`, `primitives`                                                                                  |
| Contracts                     | `defineAggregateContract`, `defineServiceContract`, `makeAggregateContractRelease`, `makeServiceContractRelease`, `upgradeAggregateContractRelease`, `upgradeServiceContractRelease`, `makeGuard`                   |
| Reads and resource operations | `findFirst`, `findMany`; model declarations expose `operations.create/update/delete/move` descriptors                                                                                                               |
| Result/failure recognition    | `resolveContractResult`, `resolveFailure`, `resolveSessionFailure`, `ZerospinSuccess`                                                                                                                               |
| Layer dependencies            | `ZerospinApiUrl`, `PublishableKey`, `CuidFactory`, `NanoIdFactory`                                                                                                                                                  |
| Errors                        | `ContractError`, `ActorError`, `AggregateError`, `ZerospinError`, `makeZerospinError`, `ensureZerospinError`, `encodeError`, `isZerospinError`, `matchZerospinErrorCode`, `prettyUnknownFailure`, `getBackendTrace` |
| Metadata                      | `ZEROSPIN_SDK_VERSION`                                                                                                                                                                                              |

Its type-only exports include `IAggregateId`, `IInferResource`, `IInferCommandPayload`, `IInferPayloadInput`, `IInferContractOperations`, `IInferContractResult`, `IInferFailure`, `ICommand`, `IAggregateCommand`, `IServiceCommand`, `ICommandOutcome`, `IExternalOutcome`, `IExternalRequestFailure`, `IDb`, `IResourceDbConfig`, `ISystemConfig`, `ISystemId`, `IResult`, `IRecognizedFailure`, `IAnyError`, `IZerospinError`, `IZerospinErrorJson`, and `IErrorJson`. A type-only config import does not initialize a server config; importing the executable backend declaration does.

## Stage and validate commands

These six functions are exported by both `@zerospin/sdk/browser` and `@zerospin/react`:

| Export                            | Inputs                               | Return and boundary                                                                                                             |
| --------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `stageAggregateSessionCommand`    | `{ session, contractName, payload }` | Synchronous `IResult` containing the ID-less Session submission and typed `stagingOutcome.result`; success commits tab optimism |
| `validateAggregateSessionCommand` | Same inputs                          | Synchronous `IResult<void, ...>`; evaluates guard/program without retention, writes, or consuming real command/resource IDs     |
| `makeAggregateSessionModelId`     | `{ session, model }`                 | Typed prefixed resource ID, synchronously generated through the initialized session                                             |
| `stageServiceSessionCommand`      | `{ session, contractName, payload }` | `IResult<...>`; synchronously commits the local journal and optimism before background handoff                                  |
| `validateServiceSessionCommand`   | Same inputs                          | Synchronous `IResult<void, ...>`; rehearses the bound program without retaining its operations                                  |
| `makeServiceSessionModelId`       | `{ session, model }`                 | Typed prefixed resource ID from the initialized service session                                                                 |

Standalone sessions use the Aggregate helpers. Agent browser Sessions only observe their exact registered definition's selected resources. Automatic Agent commands are recorded by authored callbacks and delivered by AggregateAgentNodeRepo or ServiceAgentNodeRepo to canonical command execution.

Successful staging returns `sessionId`, `sessionIndex`, immutable input and `stagingOutcome`. It has no canonical `id`. Background handoff records the Node's allocation; the Session keeps its optimistic overlay until a covering Node view installs. Treat canonical command IDs as opaque strings.

Validation success is a rehearsal against the present projection. It neither reserves a resource nor proves the server will admit/execute the later command. Expected validation failures remain silent; staging refusals return recognized failures and update `store.failure` without stopping the session. Unexpected defects report terminal session failures and can escape by throwing even from a synchronous validation or aggregate staging call. The browser owner retains the error and blocks execution; React replaces the session content through `renderError(error, retry)`. This is separate from a declared `Failure` result.

Generate IDs with the actual `model` declaration, not a string `modelName`. ID helpers throw/fail through session execution when readiness is unavailable. Keep a generated ID stable across retry of an intended resource creation.

Aggregate and service staging return synchronous `IResult` values. Declared refusals return `Failure`; unexpected defects terminate the session and may throw. Local success does not guarantee worker persistence, authoritative server finalization or external completion. Read [the synchronization boundaries](/handbook/sessions-and-synchronization#know-what-success-means).

Connected commands already retained by the Node, and original commands successfully
written to the browser journal, survive an ordinary document reload into a
supported runtime with the same exact authored binding. Recovery belongs to the
session; it requires no HTTP service worker, Vite plugin, or application shutdown
protocol. Browser journal writes remain best effort, so in-memory staging success
alone does not prove a persistent browser write succeeded. Unsaved form fields
and unfinished uploads remain the application's responsibility.

AggregateNode and ServiceNode consume selected command history with
`failure: PublicFailure | null`, selected deltas and `aggregateIndex` or
`serviceIndex` with `dispositionChainHash`. Attached sessions receive complete
Node views and compact applicable same-ID resolutions. An originating command's
nonnull final position settles local optimism even when no selected rows changed
and private `failure` is null. A null failure alone proves neither resolution
nor canonical success. Private refusal disclosure requires the exact originating
identity, full Actor claims, Node and session. Canonical
`outcome: { result: Success | Failure, finalizedAt }` remains in Chain history;
`stagingOutcome.result` remains the original local program result.

## Session definitions

A definition factory validates and captures executable declarations; it does not open storage or start connections. Independently versioned Agent declarations use `makeAggregateAgentRelease` or `makeServiceAgentRelease`; live Agent sessions receive that definition through `agentRelease`.

| Export from `@zerospin/browser`  | Configuration                                                                                            | Instance use                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `makeAggregateSessionDefinition` | Pure System/session name, aggregate name/version, actor name/version, models/contracts and claims schema | Shared executable session definition for tab, Node and worker                                                               |
| `makeServiceSessionDefinition`   | Pure System/session name, service name/version, actor name/version, models/contracts and claims schema   | Shared executable service session definition for tab, Node and worker                                                       |
| `makeAggregateAgentRelease`      | `{ agentName, agentVersion, sessionName, db, selections, contracts, ...ownerBinding }`                   | Register in `aggregateAgents` with its exact Aggregate name/version; observe with explicit Aggregate identity and bootstrap |
| `makeServiceAgentRelease`        | `{ agentName, agentVersion, sessionName, db, selections, contracts, ...ownerBinding }`                   | Register in `serviceAgents` with its exact Service name/version; observe with explicit Service identity and bootstrap       |

Aggregate, service, and standalone session definitions can compose explicit declaration modules where supported; duplicate names or invalid emitted model scope are rejected. Keep each authored definition in its own file and its application Layer in a separate module.

Concrete aggregate, service and standalone constructors receive a pure session definition, an application layer and a bundler SharedWorker URL as separate props. The application worker registers that same pure session definition with its independent execution layer and SQLite WASM asset. Each connected or standalone constructor requires `sharedWorkerUrl`: the `?sharedworker&url` import.

Connected initialization opens the SharedWorker before authenticated identity discovery. The SharedWorker validates the request against its registered declaration, authenticates each attachment independently, and selects its identity-isolated Node/database from the verified full claims. It reuses that snapshot for initial authentication and fresh-baseline installation; retained Nodes resume their existing producer and checkpoint. Connected routing names the module SharedWorker from the complete declaration/backend request, plus the requested aggregate ID for Aggregate sessions. Its authenticated database identity remains separate from that routing name: connected storage and discovery use the complete `sessionKey`, independently of the compiled SharedWorker version. Executable artifact/version checks remain exact. Standalone keeps its existing authored storage partition.

Backend API URL and publishable key come from the browser Layer; publishable keys use `Redacted.make(value)`. Secret keys belong on the server.

An Agent release is its own session definition. It binds one exact owner name
and version and declares its view, ordinary contract grants and callbacks.
Register it with `makeSystem({ aggregateAgents, serviceAgents })`, for example
`serviceAgents: { promotion: { reservations: { releases: { 1: reservationsAgentV1 }, active: 1 } } }`.
The owner's `canonical` history selection remains independent. Agent grants use
the Agent's own identity and require owner-declared claims-free ordinary contracts.

Agent selections use structured conditions over fields in their declared view.
Relation conditions see the related model’s selected rows. Agent releases reject
`where.RAW` and cycles between selections. Each entry in `wakeRules` names an existing selection. Its deterministic `wakeAt({ row, db })` calculates a deadline from confirmed selected rows. A child-only update can change its parent’s deadline. The Agent Node runs due wakes independently of browser observation. See [testing authored behavior](/guides/test-authored-behavior).

Import an owner contract as a type and use the same reference in the Agent’s `contracts` map and in `stageCommand`. The exact owner release supplies the executable contract. Inside `onWake`, the synchronous query database includes the Agent’s pending optimistic changes.

```ts
const releaseReservation = makeAgentCommandRef<
  typeof releaseUncommittedReservationV1
>('releaseUncommittedReservation', 1);

const agent = makeServiceAgentRelease({
  serviceName: 'promotion',
  serviceVersion: 1,
  agentName: 'reservations',
  agentVersion: 1,
  sessionName: 'reservations',
  db,
  contracts: { releaseUncommittedReservation: releaseReservation },
  selections: {
    promotionReservation: db.query.promotionReservation.findMany({
      where: { status: { eq: 'reserved' }, purchaseId: { isNull: true } },
    }),
  },
  wakeRules: {
    reservationExpiry: {
      selection: 'promotionReservation',
      wakeAt: ({ row }) => row.expiresAt,
      onWake: {
        program: ({ resourceId, at, stageCommand }) =>
          Effect.gen(function* () {
            yield* stageCommand(releaseReservation, {
              reservationId: resourceId,
              expectedExpiresAt: at,
            });
          }),
        onFailure: ({ failure }) => Effect.fail(failure),
      },
    },
  },
});
```

Applications can explicitly construct transient observers with
`makeAggregateAgentSession({ agentRelease, aggregateName, aggregateVersion, aggregateId, bootstrap, layer? })`
or `makeServiceAgentSession({ agentRelease, serviceName, serviceVersion, bootstrap, layer? })`.
The bootstrap callback supplies a snapshot and WebSocket URL for that exact owner
binding. Thin sessions expose their Node through the store, lifecycle and
application execution; Nodes own memory SQLite, observation checkpoints and
guarded selected views. [Studio](/guides/studio) displays declaration metadata
and Repo tables without constructing browser Agent sessions.

### Wire the executable SharedWorker

Export one pure session definition per defining file and import that same object
from the tab and its worker entrypoint. Definitions include `systemName` and the
exact owner, Actor, models, contracts and claims schema; do not derive them by
importing backend Actor releases. Construction starts no worker or database.
`makeSharedWorker` registers one definition for that executable entrypoint:

```ts title="src/game.node.worker.ts"
import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';
import { gameSessionDefinition } from './gameSessionDefinition';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: gameSessionDefinition,
});
```

Supply a `layer` there when its checked replay needs application services. The
tab's constructor receives its own application `layer` and the executable
`?sharedworker&url` import; the domain definition contains neither. See
[the Tic Tac Toe worker](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/game.node.worker.ts).

Agent name/version derive from `agentRelease`, so neither Session factory accepts a separate `agentName`. `makeAggregateAgentSession` rejects an empty `aggregateId` synchronously before creating its host or acquiring application services and SQLite. Service Agent construction requires no Aggregate ID.

Each Agent Node publishes a current `view` through `node.store.getState()`. That
view exposes only `readSelection(selection, identity)` for
synchronous declared selections. It checks lifetime, publication epoch, resource
availability and exact selection membership; the view exposes no raw database.
Captured readers become invalid after replacement, terminal revocation or disposal.
Snapshot installation and each contiguous history page atomically apply selected
resources and the `aggregateIndex` or `serviceIndex` plus
`dispositionChainHash` checkpoint. Reconnect retains this in-memory view and
checkpoint. Agent browser Nodes retain no originating command journal,
optimistic replay, command submission or wake state. See
[Agent observation](/guides/studio#observe-an-agent-release).

Agent initialization waits for first validated live replay and publishes Session `status: 'ready'` once for that lifetime. Node `view` and `connection` describe current observation availability. Allowed offline retries keep the last view visibly stale. Failure and disposal revoke guarded readers. Agent browser Sessions retain no originating command journal or pending wakes.

## Diagnose SharedWorker startup

Connected Aggregate and Service sessions accept `diagnostics: true` for
successful startup milestones. Leave it omitted or `false` to keep ordinary
successful startup quiet. Aggregate diagnostics retain their existing Effect
spans and worker telemetry; Service diagnostics cover tab-side startup without
adding a Service worker telemetry bridge. React managed session hooks accept the
same option in their session inputs.

A failed connection automatically emits one bounded `console.error` record per
page-side attempt in every environment, independently of that option. The record
identifies the current phase, last completed milestone, elapsed time, reason,
sanitized module URL, and acquisition client ID. Worker-local records include
caught bootstrap failures and available uncaught error/rejection evidence. Use
the client ID to correlate both consoles when bootstrap reached the worker.

For example, a record with `reason: 'startup-timeout'`,
`phase: 'client.bootstrap'`, and `lastCompletedPhase: 'worker.construct'` means
construction completed but bootstrap acceptance did not finish before the
existing deadline. It does not prove a module-import error. A `worker-error`
record can add native event type and source location even when the browser
supplies no error object. `message-error` identifies message deserialization
failure rather than establishing a disconnected RPC session.

Automatic records select connection metadata, fixed error categories, and
recognized connection/snapshot failure codes. Validation errors use a fixed
summary; rendered messages, stacks, custom names/codes, and event messages are
omitted. Nested causes receive the same bounded projection, including already
formatted string causes. Module/source URLs omit credentials, query strings and
fragments. Enabling `diagnostics` does not reveal these omitted details.

Diagnostic formatting/console failures cannot change session behavior. Original
errors continue through the existing session/store and React error presentation;
failure/retry behavior and public RPC error encoding remain unchanged. Native
browser reporting and developer inspection remain separate from these records.

To investigate a failure in Chrome:

1. Enable **Preserve Log** in the page Console and Network panels before
   reproducing it. Open `chrome://inspect/#workers` and inspect the SharedWorker
   console separately; check console context filters if worker output is missing.
2. Save the first failed attempt's record and match its client ID with available
   worker records before retrying. The next acquisition has a distinct client ID.
3. Compare the awaiting phase and last completed milestone. When startup failed
   before framework code executed, use the module request/worker inspector: the
   page may receive only a generic worker event and no underlying cause.

See [Chrome Console preservation](https://developer.chrome.com/docs/devtools/console/reference/#persist),
[Network preservation](https://developer.chrome.com/docs/devtools/network/reference/#preserve-log),
and the [HTML worker startup algorithm](https://html.spec.whatwg.org/multipage/workers.html#worker-processing-model).

## Session instance

Each concrete constructor creates an independent cold facade:

| Constructor                                           | Inputs beside pure `definition`                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `makeConnectedAggregateSession`                       | `sharedWorkerUrl`, `credentialsSchema`, `layer`, `aggregateId`, `getCredentials`, optional `expectedClaims` and `diagnostics` |
| `makeConnectedServiceSession`                         | `sharedWorkerUrl`, `layer`, either credentials configuration/callback or `claims`, optional `diagnostics`                     |
| `makeStandaloneAggregateSession`                      | `sharedWorkerUrl`, `claims`, `backupPath`, optional `resources` and a layer when required                                     |
| `makeMockAggregateSession` / `makeMockServiceSession` | `claims`, optional `resources` and a layer when required; no transport                                                        |

Fixed selection, identity, backup path, and seed inputs belong to that instance. A credentials callback should read the latest credentials without changing those fixed inputs.

```ts
import { makeConnectedAggregateSession } from '@zerospin/browser';
import { prefixId } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import workerUrl from './game.node.worker?sharedworker&url';
import { applicationLayer } from './applicationLayer';
import { credentialsSchema } from './gameV1';
import { gameSessionDefinition } from './gameSessionDefinition';
import { game } from './gameV1';

export async function openGameSession(aggregateId: string) {
  const id = prefixId(game, aggregateId);
  const session = makeConnectedAggregateSession({
    definition: gameSessionDefinition,
    sharedWorkerUrl: workerUrl,
    credentialsSchema,
    layer: applicationLayer,
    aggregateId,
    expectedClaims: { aggregateId, instanceId: id },
    getCredentials: () => Effect.succeed({ instanceId: id }),
  });
  try {
    await session.initialize();
    return session;
  } catch (error) {
    await session.dispose();
    throw error;
  }
}
```

The caller owns the returned session and calls `await session.dispose()` when its screen/application lifetime ends. Keep the instance initialized while it is needed; disposing immediately after staging is not a durability handshake. React applications normally let `useConnectedAggregateSession(definition, options)` own this lifetime and publish its handle through `SessionProvider` instead.

| Member                                | Behavior                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initialize(options?): Promise<void>` | Starts the captured identity, acquires dependencies/storage/connections, and resolves when readiness is published; rejects on failed bootstrap               |
| `dispose(): Promise<void>`            | Revokes readiness synchronously and then releases the runtime/resources; dispose every manually owned instance                                               |
| `runSync(effect)`                     | Runs synchronous Effect work through the current private lifetime; returns its value or throws; async suspension is invalid                                  |
| `runPromise(effect, options?)`        | Runs Effect work in that private lifetime; returns a Promise; supports Effect run options and rejects on escaping failure                                    |
| `store`                               | Published projection/readiness/telemetry state and subscriptions; ordinary UI reads through hooks                                                            |
| `onInitialized(handler)`              | Aggregate, service, and standalone only: one-shot success-only readiness subscription; already-ready registration invokes synchronously; returns unsubscribe |
| `sessionId`                           | Current live session ID or `null` when unavailable                                                                                                           |
| `sessionDefinition`                   | Captured session definition                                                                                                                                  |
| `reportFailure(report)`               | Synchronously reports a command refusal, nonterminal recovery notice or terminal session error into the existing store                                       |
| `clearAuthentication()`               | Retires aggregate/service facades and revokes their exact known identity, including before readiness or after failure/disposal                               |
| `reset()`                             | Standalone-only; resets its captured local state/backup to the standalone initialization                                                                     |

Credential sessions need complete `expectedClaims` to clear authentication before
their first successful admission. Disposal alone does not revoke remembered identity.

General `runSync` and `runPromise` work lazily acquires application services,
including before initialization, without publishing readiness. Command staging,
validation and model-ID helpers first require a usable initialized capability.
Saved execution delegates select the current lifetime after ordinary
reinitialization; work already submitted belongs to the lifetime that admitted it.
Duplicate initialization throws synchronously. After ordinary disposal, execution
rejects until another initialization establishes a lifetime; a terminal failure
requires a new instance. `dispose()` acknowledges local cleanup; it does not prove
that the shared Node's transport, SQLite or namespace lease has closed.

Connected retry constructs a fresh facade and calls
`initialize({ retryConnection: true })`. Only blocked
`node-subscription-closed` or `node-subscription-timeout` transport attempts are
eligible after the preceding attempt drains. Retry preserves Node identity,
resources, pending commands and checkpoints. Ordinary attach/resume does not clear
blocked work. Authentication, admission, projection, persistence and checkpoint
failures retain their own recovery policy; see
[failures and recovery](/handbook/failures-and-recovery).

The facade has no public `accept`, `pushNow`, `awaitCommandResult`, or mutable runtime field. Lower-level worker/DevTools capabilities are separate from application session APIs. After an owner unmounts, use its replacement session rather than keeping the old one in a closure.

## Mock session instance

[`makeMockAggregateSession({ definition, claims, resources?, layer? })`](https://github.com/morgs32/zerospin/blob/main/packages/browser/src/makeMockAggregateSession.ts) and `makeMockServiceSession` own real in-memory sessions from their corresponding pure definitions. Claims and seeded resources are decoded values; each supplied resource must include the model's framework fields. Initialize and dispose it with the same explicit ownership as other manually constructed sessions. It needs no worker factory, API configuration or credentials.

The `layer` property is optional only when replay requires no services beyond the built-in session runtime. If a declared program needs application services, the factory requires a layer providing them and preserves its services in `runSync`/`runPromise`. In React, use `useMockAggregateSession(definition, options)` or [`useMockServiceSession`](/reference/react#mock-sessions). Publish the handle through `SessionProvider` and keep the same `SessionReady` and `useSession(definition)` readers used by connected acquisition.

## Worker entry and storage

Standalone constructor inputs accept `discardUnrestorable: true` when the
application explicitly treats its local document as disposable. The default is
false. The same option is accepted by `useStandaloneAggregateSession`.
During attachment, the standalone owner may discard its exact locked partition
once when retained metadata, checkpoint, resource, or original/final command
validation proves it unreadable. Attachment audits all retained originals and
finals, including resolved originals, independently of browser pending commands.
It validates captured seed resources first and
restores those seeds under a fresh producer identity. For an already-attached
owner, live clients acknowledge reset before destructive work; the owner rechecks
the document after fencing and preserves a document repaired in that interval.
Readiness and failure still flow through the ordinary managed handle and
`SessionReady`; this adds no managed reset method or consumer delivery waiter.

This opt-in does not reset healthy state, generic exceptions, worker/WASM or
storage access failures, foreign identity, invalid input seeds, or a failed
attempt's replacement. Ordinary Retry reopens the same partition and can begin
a new owner lifetime. Existing incompatible SQLite-version recovery remains
framework-owned. Explicit standalone `reset()` remains a deliberate operation
on a nonfailed facade.

After an automatic replacement succeeds and its new snapshot validates, affected
live connections receive the nonterminal `standalone-state-reset` notice through
the session store with `origin: 'recovery'`. React's existing `onFailure` observer
receives the same notice, including when cold initialization resets storage before
the page has a snapshot subscription. This covers opt-in retained-state recovery and existing
incompatible-storage replacement. Its message is: “Your saved local document could
not be restored and was reset to its initial state.”

The notice does not make readiness fail or block successful recovery. A concurrent
repair that avoids replacement, a failed replacement, and explicit `reset()` do
not emit a reset-success notice. A later healthy attachment does not receive an
old notice. Keep the normal observer mounted through initialization; no `onReset`
callback is added.

Each aggregate, service, or standalone session has its own application-owned worker entry, and that entry registers its pure session definition. The frontend bundler emits that worker and the SQLite WASM asset with the application.

Standalone sessions register their pure session definitions in an authored worker entry through the public package subpath:

```ts title="src/guest.worker.ts"
import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';
import { guestGameSessionDefinition } from './guestGameSessionDefinition';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: guestGameSessionDefinition,
});
```

This standalone example uses Vite's `?url` asset handling. Give each session its own worker entry. See [guest-to-account transfer](/guides/guest-to-account) for the complete standalone session definition and [React and Next.js](/guides/react-and-nextjs) for browser bundling and client boundaries.

The tab projection, durable SharedWorker SQLite state, and backend projection are
separate persistence boundaries. Connected Aggregate and Service recovery runs in
production and development. A bounded cycle first preserves the validated
original-command stream and producer identity while reinstalling an authenticated
baseline. If that stream is unrecoverable, it may replace only the affected
namespace with a fresh producer and report possible local-work loss. Fresh
snapshot validation and live attachment reset acknowledgements precede destructive
work. Failed authentication, connectivity or snapshot proof preserves storage.
Reload or explicit Retry starts another attempt; ordinary reconnects do not.
Applications acquire no connected `reset()` API. See
[recovery behavior](/handbook/failures-and-recovery#connected-session-recovery).

### Connected browser storage upgrades

Connected Aggregate and Service Nodes keep the original commands, producer identity,
admission position and retained outcomes in SQLite. A resource table is a local
copy of what the authenticated Actor can read. Changing its columns, indexes or
materialization logic rebuilds the affected copy under the Node's storage lease.
The Node replays from a retained snapshot and contiguous history, commits the
confirmed rows and checkpoint together, then applies uncovered originals in order.
A pending offline move stays visible once. If the Node lacks a suitable source,
it keeps the commands and asks for an authenticated snapshot on reconnect.

The command-storage format changes when its durable representation changes.
The Node verifies the actual command schema and the immutable migration ledger.
It recognizes both Aggregate formats shipped as SQLite version 24. An outstanding
predecessor or upload requirement that the current runtime cannot execute blocks
adoption and leaves the original intact. Unknown formats and changed authored
bindings also preserve the previous queue. Each meaning-preserving SQL change commits locally
with its ledger entry, including when pending work is offline or explicitly
paused. The same original is eligible for delivery on reconnect when pushing
is enabled. Framework authors edit the current Drizzle tables and append
`{ id, name, sql }` to the family’s `aggregateNodeDatabase` or
`serviceNodeDatabase` declaration. Existing applications use the same worker entry.

Discovery uses `zerospin:aggregate:discovery` or `zerospin:service:discovery`.
The original SQLite file is scoped by the exact authenticated session key.
On local development endpoints, the authenticated snapshot also identifies the
accepted System history. An ordinary restart reuses the same file and producer.
When `zerospin dev --clean` explicitly replaced a previously verified history,
discovery selects a separate SQLite namespace before opening the old file. While
the CLI is starting, the browser retries snapshot authentication until the local
System accepts its spec. The new producer starts from the fresh authenticated
baseline. Old files and tab journals remain associated with their original history. Missing proof or a missing
producer preserves that work and reports the failure.

Distinct runtimes contend for one lease per binding. An attachment that times
out reports `node-storage-owner-busy`. After the other owner releases the lease,
retry reopens the same storage. Databases from before stable session-key storage
remain a separate, explicit cutover. Standalone and Native sessions have their
own storage lifecycles.

## Lifecycle and failure reporting

The same store publishes `status` and `failure: IZerospinError | null`:

| Status         | Meaning                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `idle`         | Constructed; lazy runtime acquisition alone does not initialize it                                 |
| `initializing` | Initialization is admitted and resources are being acquired                                        |
| `ready`        | Ordinary sessions publish a usable `initialized` capability; Agent sessions completed first replay |
| `disposed`     | Explicit disposal synchronously revoked capability; await disposal for cleanup                     |
| `failed`       | A terminal error fenced execution and permanently revoked this instance                            |

`session.reportFailure({ origin: 'command', error })` accepts a recognized command
refusal and updates the latest failure without changing readiness. The framework
uses `{ origin: 'recovery', error }` for a nonterminal notice when connected
recovery may have lost or left local work unconfirmed, or when automatic standalone
replacement completed with `standalone-state-reset`.
`session.reportFailure({ origin: 'session', error })` accepts unknown errors,
fences execution and atomically publishes failed status, its error and null
initialized capability. Runtime reporting preserves the Effect Fail/Die
distinction and original Exit/Cause. Foreign values become `session-failed` with
bounded diagnostic cause; existing Zerospin fields are preserved.
Agent Sessions revoke guarded selected-resource readers immediately. Normal
disposal detaches the observer Node after its transport and SQLite close.

Every occurrence publishes a fresh error instance. The first terminal occurrence
remains pinned through cleanup. A failed instance needs a fresh owner; ordinary
disposal/reinitialization waits for cleanup and preserves nonterminal failure.
Only a fresh instance starts with `failure: null`. Subscribe directly through
`store.subscribe((state, previous) => ...)`, release it with the owning lifetime,
and notify on a new nonnull failure reference when `status !== 'failed'`.
Mount this observer through initialization and recovery so startup notices are
observable; gate only session readers and command UI on readiness. Subscription
does not replay a current failure. Terminal React presentation
belongs to `SessionReady`'s local boundary and required `renderError(error, retry)`.

The package's type exports include `IBrowserSession`,
`IBrowserSessionInitializeOptions`, `IStandaloneSessionInitialization`,
`IAggregateAgentSession`, `IServiceAgentSession`, `ISessionStatus`,
`ISessionLifecycleState`, `ISessionFailureReport` and `ISessionFailureReporter`. Infer session types from
concrete definitions so owner names, model fields and command payloads remain
checked. The [package barrel](https://github.com/morgs32/zerospin/blob/main/packages/browser/src/index.ts)
and [instance types](https://github.com/morgs32/zerospin/blob/main/packages/browser/src/browserSession/types.ts)
define the complete surface.
