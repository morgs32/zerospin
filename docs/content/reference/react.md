---
title: React reference
description: Own managed sessions with hooks, preserve public UI, and gate typed readers locally.
order: 3
---

## Public imports

```ts
import {
  useConnectedAggregateSession,
  useConnectedServiceSession,
  useStandaloneAggregateSession,
  useMockAggregateSession,
  useMockServiceSession,
  SessionProvider,
  SessionReady,
  useSession,
  useSessionState,
  useClearSessionAuthentication,
  useClaims,
  useLiveQuery,
  loadDevtools,
  ZerospinDevtoolsLoader,
} from '@zerospin/react';
```

These are exports from the [current package barrel](https://github.com/morgs32/zerospin/blob/main/packages/react/src/index.ts).
`@zerospin/sdk/browser` supplies browser-safe declarations and synchronous command helpers.
Keep executable backend configuration and server SDK modules outside the client graph.

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
import { gameSessionDefinition } from './gameSessionDefinition';

interface IWorkspaceProps {
  aggregateId: string;
  children: ReactNode;
}

function GameWorkspace({ aggregateId, children }: IWorkspaceProps) {
  const session = useConnectedAggregateSession(
    gameSessionDefinition,
    {
      sharedWorkerUrl: gameWorkerUrl,
      credentialsSchema: gameCredentials,
      layer: applicationLayer,
      aggregateId: aggregateId,
      getCredentials,
    },
    { onFailure: error => toast.error(error.message) },
  );
  return (
    <SessionProvider session={session}>
      <Header />
      <SessionReady
        definition={gameSessionDefinition}
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
  const session = useSession(gameSessionDefinition);
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
facade. Managed acquisition and cleanup need no application-owned persistence,
delivery, Node-retention or canonical-execution waiters. Explicit authentication
revocation uses the sign-out action below before the identity provider signs out.
Standalone retry reopens retained storage without resetting it; mock retry
recreates seeds; connected retry preserves framework recovery rules.

Pass `{ onFailure }` as the hook's third argument to receive new nonterminal
failure occurrences, including startup/recovery notices. Observation begins
before initialization and ends with the owned lifetime. Terminal errors appear
through `SessionReady`; successful preservation is silent. No subscription should
be hidden behind a readiness gate merely to display notifications.

## Sign out

Inside the matching `SessionProvider`, `useClearSessionAuthentication(definition)`
returns an async action independent of readiness. Await it before signing out of
the application's identity provider:

```tsx
// This control may live outside SessionReady, while its provider stays mounted.
const clearAuthentication = useClearSessionAuthentication(
  gameSessionDefinition,
);

// In the application's Sign out click handler:
await clearAuthentication();
await signOut(); // The identity provider's existing action.
```

For connected Aggregate/Service sessions, completion means the owned live
attachments have stopped synchronization and remembered offline eligibility has
been durably invalidated. Failed or disabled sessions retain this operation for
their previously owned identities; a never-enabled owner has nothing to revoke.
Provide complete `expectedClaims` when authentication must be cleared before the
first successful admission. Saved model data remains on the device. If revocation
fails, surface that failure and let the user retry; do not claim offline access
was revoked. Standalone sessions reject this authentication operation. Session
disposal alone does not revoke remembered authentication.

## Mock sessions

```tsx
function Story() {
  const session = useMockAggregateSession(gameSessionDefinition, {
    claims: fixtureClaims,
    resources: fixtureResources,
    layer: storyApplicationLayer,
  });
  return (
    <SessionProvider session={session}>
      <SessionReady
        definition={gameSessionDefinition}
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

## useLiveQuery

`useLiveQuery({ session, key?, query })` reads an initialized aggregate or service projection and subscribes to relevant database changes. `query` receives the typed database and, when present, `key`. It returns a supported Drizzle relational query such as `findFirst` or `findMany`.

| Return field | Meaning                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| `data`       | The query's typed result; `findFirst` may return `undefined`, while `findMany` returns rows |
| `updatedAt`  | Time of the latest successful query read, when available                                    |

Put changing query inputs in `key`; plain arrays/records are compared by their contents, so rebuilding a simple key with the same values does not create a different subscription. Browser and native SQLite drivers automatically record every table the query reads, including nested relations, joins, subqueries and views, even when the result is empty. Only committed changes to those tables cause a reread; savepoint rollback discards its notifications. A query reading no tables does not rerun on table changes. Do not poll the projection in an interval or mirror it into a second state store.

Call the hook inside `SessionReady` after reading its session with `useSession(definition)`. An unpublished session database throws `session-store-not-initialized`. Query failures terminate the whole session; missing rows remain normal data. Initial read failures throw an owned `SessionQueryError` during render. A committed reread failure synchronously reports session origin and ends its subscription before React renders the error; the query store retains the raw thrown value, including null or undefined. Nested application error boundaries must rethrow fatal session errors to the matching `SessionReady` boundary. Diagnostic `useLiveQueryOnDb` readers remain available outside the failed subtree. Expected command refusals remain local results and notifications.

[The query guide](/guides/query-data) expands this into lists, detail selection, and reactive state after writes. [The hook source](https://github.com/morgs32/zerospin/blob/main/packages/react/src/useLiveQuery.ts) documents the aggregate/service overloads.

## useClaims

`useClaims(session)` subscribes to admitted aggregate claims or published service claims. It returns the concrete claims type from the session store and updates when that published capability changes. Call it in explicitly readiness-gated UI; an unpublished store throws `session-not-initialized`.

Use claims to display the active account or choose UI behavior. They do not replace authoritative guards. `expectedClaims` is an initialization assertion, whereas `useClaims` reads the admitted/published capability. Read [authentication](/guides/authenticate) before handling identity transitions.

## Command helpers

The React barrel also re-exports `stageAggregateSessionCommand`, `validateAggregateSessionCommand`, `makeAggregateSessionModelId`, `stageServiceSessionCommand`, `validateServiceSessionCommand`, and `makeServiceSessionModelId`. These are ordinary functions, not React hooks. Their `{ session, contractName, payload }` inputs and `{ session, model }` ID-helper inputs are the same as the SDK/browser functions.

Read [the browser command reference](/reference/browser#stage-and-validate-commands) for the return types and completion boundaries. Aggregate and service staging and validation are synchronous. A declared refusal returns `Failure`; an unexpected defect terminates the session and can throw.

## Development tools

`<ZerospinDevtoolsLoader defaultOpen={false} />` mounts once near the application root. It loads the DevTools shell after commit and owns its cleanup. The `defaultOpen` value is captured at mount; remount to select a new initial value.

For imperative ownership, `await loadDevtools({ defaultOpen? })` returns `{ open(): Promise<void>, dispose(): void }`. The shell has its own DOM host/root and is independent of session ownership. Call `dispose` when its owner ends. Load/open can reject if its chunk or UI cannot mount; handle that rejection at your application boundary.

## Generated forms subpath

The separate `@zerospin/react/primitives` entry exports `ShapeForm`, `primitiveInputsMap`, `IShapeFormProps`, and `IPrimitiveInputProps`; import its companion `@zerospin/react/primitives.css` for styling. These tools use shape descriptors to render inputs. They are not part of the main session-hook barrel and do not stage a command automatically.

Check the [form implementation](https://github.com/morgs32/zerospin/blob/main/packages/react/src/primitives/ShapeForm.tsx) when integrating a generated form; the standard command path still validates/stages a concrete contract payload. The [write guide](/guides/write-commands) covers that boundary.
