# @zerospin/react

## Managed sessions and stable UI

Pure session definitions declare models, contracts, claims and exact revisions.
Call a concrete hook with the definition and separate host/instance options:
`useConnectedAggregateSession`, `useConnectedServiceSession`,
`useStandaloneAggregateSession`, `useMockAggregateSession` or
`useMockServiceSession`. The hook owns one managed browser-session lifetime and
returns immediately without suspending. It does not open browser resources during
render or on the server.

```tsx
import type { ReactNode } from 'react';
import {
  SessionProvider,
  SessionReady,
  useConnectedAggregateSession,
  useSession,
} from '@zerospin/react';
import { humanSessionDefinition } from './humanSessionDefinition';

interface IWorkspaceProps {
  humanId: string;
  children: ReactNode;
}

function HumanWorkspace({ humanId, children }: IWorkspaceProps) {
  const session = useConnectedAggregateSession(
    humanSessionDefinition,
    {
      sharedWorkerUrl: humanWorkerUrl,
      credentialsSchema: humanCredentials,
      layer: applicationLayer,
      aggregateId: humanId,
      getCredentials,
    },
    { onFailure: error => toast.error(error.message) },
  );
  return (
    <SessionProvider session={session}>
      <Header />
      <SessionReady
        definition={humanSessionDefinition}
        fallback={<Loading />}
        renderError={(error, retry) => (
          <SessionError error={error} onRetry={retry} />
        )}
      >
        {children}
      </SessionReady>
    </SessionProvider>
  );
}

function Editor() {
  const session = useSession(humanSessionDefinition);
  return <p>{session.sessionDefinition.sessionName}</p>;
}
```

The example's application imports and presentation modules are supplied by the host. There is no separate UI declaration module.
`SessionProvider` publishes the managed handle without acquiring another lifetime
or gating its children. Public content stays mounted while initialization,
identity replacement, recovery or retry changes the session. Nest providers for
different definitions; the nearest provider for a definition supplies its readers.

Options may also be a resolver: `() => accountId && ({ ...accountOptions })`.
`null`, `undefined`, `false` and `''` disable the session. Continue calling the hook
unconditionally; disabling revokes the old capability and releases its resources.
Changing fixed identity, definition, layer, host, claims, seed or backup inputs
replaces the internal session without keying the application subtree.
`getCredentials` reads the latest committed callback without replacing identity.
Keep layers and definitions stable and import definitions directly from their
owning modules.

The handle exposes `isEnabled`, `isReady`, `error`, `retry`, and `session`.
`session` is nonnull only while ready and retains the constructor's supplied
Effect layer service types. `useSession(definition)` derives its execution services
from the declaration; use the precise handle's ready `session` for additional
application-layer services. `useSessionState(definition)` observes readiness,
error and retry without requiring readiness. `useSession(definition)` is the
ready-only typed reader used inside `SessionReady`; hooks and state readers do
not suspend. `isReady` can return to false during recovery. A ready service may
still refuse writes with `service-session-not-current`.

`SessionReady` gates only its dependent children. Its optional `fallback` defaults
to null. A disabled session renders no ready content or fallback. Required
`renderError(error, retry)` owns terminal presentation and must
not read the failed session. Owned query errors terminate that session. Foreign
query errors propagate to their matching readiness boundary. Ordinary UI render
exceptions propagate to an enclosing React error boundary.
Retry and identity replacement fence stale work, own cleanup, and create a fresh
facade. The application never waits for persistence, delivery, Node retention,
synchronization or canonical execution before navigation or account changes.
Standalone retry reopens retained storage without resetting it; mock retry
recreates seeds; connected retry preserves framework recovery rules.

Standalone options may opt into `discardUnrestorable: true` for an explicitly
disposable local document. Its worker then performs at most one destructive
restoration for recognized retained-data failures, using captured validated seeds.
Healthy documents, environment/access failures, and foreign identity are retained.
Shared clients acknowledge reset and a repaired document is rechecked before
discard. Ordinary managed readiness/error state describes completion or failure;
there is no managed `reset` method. See the browser session skill for exact codes.

Pass `{ onFailure }` as the hook's third argument to receive new nonterminal
failure occurrences, including startup/recovery notices. Observation begins
before initialization and ends with the owned lifetime. Terminal errors appear
through `SessionReady`; successful preservation is silent. No subscription should
be hidden behind a readiness gate merely to display notifications.

Successful automatic standalone replacement emits `standalone-state-reset`
through this observer after the replacement snapshot validates. The notice stays
nonterminal and does not prevent readiness. It covers cold/warm opt-in recovery
and existing incompatible-storage replacement; concurrent repair that avoids
replacement, failed replacement, and explicit manual reset emit no reset-success
notice. Later healthy attachments do not receive an old notice.

```tsx
useStandaloneAggregateSession(guestSessionDefinition, guestOptions, {
  onFailure: error => {
    if (error.code === 'standalone-state-reset') {
      toast.warning(error.message);
      return;
    }
    reportError(error);
  },
});
```

The reset notice says, “Your saved local document could not be restored and was
reset to its initial state.” The existing `onFailure` observer handles it; there is
no public `onReset` callback.

## Seeded mock sessions

```tsx
function Story() {
  const session = useMockAggregateSession(humanSessionDefinition, {
    claims: fixtureClaims,
    resources: fixtureResources,
    layer: storyApplicationLayer,
  });
  return (
    <SessionProvider session={session}>
      <SessionReady
        definition={humanSessionDefinition}
        fallback={<Loading />}
        renderError={renderSessionError}
      >
        <Editor />
      </SessionReady>
    </SessionProvider>
  );
}
```

Mock and connected hooks use the same pure definition, provider and consumer
hooks. Mocks use decoded claims and optional complete resource seeds in a local
in-memory SQLite replica, without API configuration, credentials or SharedWorker.
Supply `layer` whenever authored execution requires application services. Connected
layers additionally provide `PublishableKey` and `ZerospinApiUrl`.
After seed, edit through commands. Aggregate mocks perform optimistic local
execution without proving canonical admission or completion. Service mocks allow
local validation but refuse submission. External providers are not simulated.

`useLiveQuery({ session, key?, query })` returns `{ data, updatedAt }`. Put changing
inputs in `key`. Failed reads terminate their owning session; missing rows are
normal results. Use `useClaims(session)` only in readiness-gated content.

## Commands and application Effects

Command operations take the session explicitly. Aggregate and service staging
return synchronously after committing to the local journal. Validation checks guards and programs without
retaining a command or reporting a refusal. Model IDs come from the owning
session's application layer:

```ts
import {
  makeAggregateSessionModelId,
  stageAggregateSessionCommand,
  validateAggregateSessionCommand,
} from '@zerospin/react';

const id = makeAggregateSessionModelId({ session, model: personV1 });
const validation = validateAggregateSessionCommand({
  session,
  contractName: 'create',
  payload: { id, name },
});
const result = stageAggregateSessionCommand({
  session,
  contractName: 'create',
  payload: { id, name },
});
```

Service equivalents are `makeServiceSessionModelId`,
`validateServiceSessionCommand`, and `stageServiceSessionCommand`.
Recognized local staging refusals return the recognized result and report a
nonterminal occurrence to `session.store`. The session owns later delivery, Node
persistence and authoritative execution. Later admission or execution refusals
preserve the successful staging result and report through that same store.

Run other application Effects through the typed session methods:

```ts
const value = session.runSync(applicationEffect);
const valueLater = await session.runPromise(asynchronousEffect);
```

They use the private runtime and the current session lifetime, including when a
saved execution method is called after reinitialization. General execution is
available before initialization and lazily acquires the application layer.
Cold domain staging returns its readiness failure without acquiring that layer.
Escaping defects from execution, acquisition, owned background work, and cleanup
report a terminal session failure while preserving the original Exit/Cause or
JavaScript rejection. The session blocks further work and disposes its runtime.
Interruptions stay quiet; recovered defects and returned typed application
failures retain their existing behavior. Runtime reporting distinguishes an
Effect failure from a defect before normalizing diagnostics.

Subscribe to the existing store within the component's effect lifetime:

```tsx
useEffect(
  () =>
    session.store.subscribe((state, previous) => {
      if (
        state.status !== 'failed' &&
        state.failure !== null &&
        state.failure !== previous.failure
      ) {
        toast.error(state.failure.message);
      }
    }),
  [session],
);
```

`failure: IZerospinError | null` holds the latest reported error. Every occurrence
has a fresh error reference, including repeated equal messages. One classifier
uses `session.reportFailure({ origin: 'command', error })` for recognized command
refusals and `{ origin: 'session', error }` for terminal query, render, startup and
unexpected infrastructure failures. Errors outside session execution require
explicit reporting. The first terminal error remains pinned through cleanup;
subscribers are isolated so one throwing callback cannot block the others.
The subscription above handles new refusals without replaying an old failure on
remount. Terminal presentation belongs to `renderError`.

The same store exposes `status`: `idle` before initialization, `initializing`
during acquisition, `ready` with a usable `initialized` capability, `disposed`
after synchronous capability revocation, and `failed` after terminal reporting.
Terminal reporting atomically publishes `failed`, the error and
`initialized: null` after fencing execution. `dispose()` resolves after cleanup;
ordinary reinitialization waits for cleanup and preserves the latest nonterminal
failure. Only a fresh instance starts with `failure: null`; a failed instance
cannot be reused. Explicit browser offline recovery and deliberate sign-out stay
quiet. Later command rejection reaches the originating initialized session after
committed rollback.

## Claims

`useClaims(session)` returns admitted aggregate claims or published service
claims. Call it inside explicitly readiness-gated UI. Aggregate claims retain one detached
snapshot per initialized session reference: progress updates preserve it, a new
admission refreshes it, and disposal clears it. Service claims retain their
published snapshot. Unpublished claims throw `session-not-initialized`.

## DevTools

Mount one `ZerospinDevtoolsLoader` near the application root so the DevTools
shell stays mounted across route changes. The component is available from
`@zerospin/react` and its defining module:

```tsx
import type { ReactNode } from 'react';
import { ZerospinDevtoolsLoader } from '@zerospin/react/ZerospinDevtoolsLoader';

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === 'development' && <ZerospinDevtoolsLoader />}
      </body>
    </html>
  );
}
```

The caller chooses when to include DevTools; the component has no environment
gate. For Vite, use `import.meta.env.DEV` as the development condition.

`defaultOpen` defaults to `false` and is read once when the component mounts.
Changing it while mounted does not toggle or reload the shell; remount the
component to apply a different initial value. Initialization runs after React
commit and skips effects canceled during StrictMode replay. Cleanup disposes
the shell, including a load that finishes after unmount. Load failures are
logged without interrupting the application.

`loadDevtools({ defaultOpen })` remains available for imperative callers. Await
its returned handle to call `open()` and release the shell with `dispose()`
when its owner ends.

## Shape forms

```tsx
import { ShapeForm } from '@zerospin/react/primitives';
import '@zerospin/react/primitives.css';
<ShapeForm
  shape={contract.payload}
  defaultValues={payload}
  onSubmit={submitPayload}
/>;
```

`shape` is the primitive descriptor map authored with `@zerospin/shapes`.
`defaultValues` is optional and accepts a partial decoded row. Omitted fields
use their descriptor defaults when present; otherwise text, identifiers,
numbers, dates, JSON, and enums start as blank drafts, and booleans start
unchecked. Explicit null and falsy values override descriptor defaults.
The shape determines the complete value type
received by `onSubmit`, including enum literals, prefixed IDs, nullable values,
JSON data, and `Date` instances. The callback can return a promise.

The form owns its TanStack state, renders labels from field names, and validates
the complete row on submission through `makeEffectSchema(shape)`. Unfinished
numbers, ISO timestamps, and JSON remain editable drafts and prevent submission.
Nullable fields have an explicit null control; empty text remains a distinct
value. Dates use ISO timestamp text so their time and milliseconds survive
editing. References use string or numeric inputs according to the referenced
column; they do not load related rows.

Initial values are encoded through the shape's codec, including asynchronous
JSON codecs. Submission decodes through that same codec. Initialization and
submission errors are displayed, and failed submissions retain the edits.
The shape and `defaultValues` initialize the form once; change its React `key`
to start a different form. `disabled` can change while the form is mounted; it
disables every input, null control, and Submit, and prevents submission even
when asynchronous validation is already running. The form retains drafts while
disabled. An empty `shape` still renders Submit and submits `{}`.
Unmounting or changing the form's key prevents an unfinished validation or
decoding operation from invoking the old form's submission callback.

`primitiveInputsMap` exposes the default draft input components by
`PrimitiveKind`. `ShapeInputs` is the form's internal renderer.

Import `primitives.css` once in the application's stylesheet entry or root
layout. It contains compiled StyleX rules for the adapted
[shadcn-cssinjs](https://www.shadcn-cssinjs.com/) controls. Consumers need no
StyleX compiler. Styles use the usual shadcn CSS variables with fallback values,
and do not install a global reset. License attribution lives beside the controls.

The package's `lib` and `watch` commands compile TypeScript and then publish the
primitives JavaScript and CSS together. Run their Nx tasks from the workspace:

```sh
pnpm nx run @zerospin/react:lib
pnpm nx run @zerospin/react:ts
```
