---
title: React and Next.js
description: Own browser sessions with managed hooks, keep public shells mounted, and gate local readers.
order: 4
---

## Own a session without gating the page shell

Import the pure session definition directly in its tab, worker and readers. A
managed hook accepts that definition and separate transport/application options;
there is no intermediate UI declaration module.

```tsx title="src/GameView.tsx"
'use client';

import {
  SessionProvider,
  SessionReady,
  useConnectedAggregateSession,
} from '@zerospin/react';
import { Effect } from 'effect';
import workerUrl from './game.node.worker?sharedworker&url';
import { applicationLayer } from './applicationLayer';
import { credentialsSchema } from './gameV1';
import { gameSessionDefinition } from './gameSessionDefinition';
import { Board } from './Board';

export function GameView(props: {
  aggregateId: string;
  gameId: `gam_${string}`;
}) {
  const { aggregateId, gameId } = props;
  const session = useConnectedAggregateSession(gameSessionDefinition, {
    sharedWorkerUrl: workerUrl,
    credentialsSchema,
    layer: applicationLayer,
    aggregateId,
    expectedClaims: { aggregateId, instanceId: gameId },
    getCredentials: () => Effect.succeed({ instanceId: gameId }),
  });
  return (
    <SessionProvider session={session}>
      <h1>Tic-Tac-Toe</h1>
      <SessionReady
        definition={gameSessionDefinition}
        fallback={<p>Connecting to the game…</p>}
        renderError={(error, retry) => (
          <section role="alert">
            <p>{error.message}</p>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </section>
        )}
      >
        <Board gameId={gameId} />
      </SessionReady>
    </SessionProvider>
  );
}
```

`Board` uses `useSession(gameSessionDefinition)` plus the query/staging logic in
[the first-feature guide](/guides/build-first-feature). The anonymous credential
scheme is suitable only for that demo. Connected layers provide API configuration
and the definition's required Effect services. The handle's ready session retains
the concrete supplied layer services.

The hook returns without suspending, opens resources after commit, and releases
its generation on disable, replacement or unmount. `SessionProvider` always renders
its children. `SessionReady` gates only database-dependent content, owns local
Suspense and terminal errors, and withdraws readers if readiness is lost. Its
`renderError(error, retry)` is required; fallback defaults to null.

Update identity through options rather than keying the page. A resolver returning
`null`, `undefined`, `false` or `''` disables the account session while the public
shell and any independent guest session remain mounted. Refreshing `getCredentials`
uses the latest committed callback. Authentication, readiness and guest/account
workspace selection are separate application facts.

For Storybook, replace the acquisition hook with `useMockAggregateSession` and
supply decoded claims, complete seeds and any required substituted application
layer. Keep the same definition, provider and readers. See [the mock reference](/reference/react#mock-sessions).

## Keep browser initialization behind a client boundary

Next's Server Components can render the page shell and fallback. They cannot open a SharedWorker, read localStorage, or own this SQLite session. Mark the interactive island `use client`; perform browser-only identity setup after mount or inside a client-only loaded island.

When your session module or third-party dependency requires browser globals during module evaluation, load the island through a client wrapper:

```tsx title="app/game/GameClient.tsx"
'use client';

import dynamic from 'next/dynamic';

export const GameClient = dynamic(() => import('./GameIsland'), {
  ssr: false,
  loading: () => <p>Loading the game…</p>,
});
```

`GameIsland` is the default-exported component in your app that establishes the anonymous ID and renders `GameView`. Keep `ssr: false` in a Client Component, following [Next's client-only loading guidance](https://nextjs.org/docs/app/guides/lazy-loading#skipping-ssr). The server page imports `GameClient` and renders it; no session is initialized on the server.

## Bundle the application worker and WASM assets

Each session has its own worker entry. That entry imports the same pure session definition as the tab, registers it with `makeSharedWorker`, and supplies the SQLite WASM asset from `@zerospin/browser`. The managed hook receives the bundler's `sharedWorkerUrl` so the frontend bundler can emit that executable worker graph and its WASM dependency. Connection opens the module SharedWorker after resolving the session identity; declaration construction stays cold.

Verify the emitted worker and WASM requests in your application's browser build, including its deployment base path and same-origin hosting. Apply the application's CSP requirements to those assets. This docs site's Next renderer does not itself initialize Zerospin browser sessions.

Standalone hooks still receive their own SharedWorker URL and entry because the worker executes their authored contracts. Follow [the standalone guide](/guides/guest-to-account) and configure your bundler to emit that entry and the exported `@zerospin/browser/sqlite.wasm` asset. The guide's `?url` import is Vite-specific; another bundler must resolve its equivalent asset URL.

## Read, submit, and clean up

Inside the island, use `useLiveQuery` for selected local rows and the standalone staging helpers for commands. Let the managed hook release its session on disable, replacement and unmount. For a non-React host, `makeConnectedAggregateSession({ definition, layer, sharedWorkerUrl, credentialsSchema, ...inputs })` creates the instance; explicitly await `initialize()` and eventually `dispose()`.

Pass the managed hook's third `{ onFailure }` argument to display changed
nonterminal command and possible-loss recovery notices. The framework installs
that observer before initialization; it stays active through loading and recovery.
Terminal presentation belongs to `SessionReady`'s required `renderError(error, retry)`.
Account changes update hook options; they never await persistence or delivery.
See [Write commands](/guides/write-commands) and [Authentication](/guides/authenticate).

## Verify the integration

Check SSR renders its fallback without browser-global errors. In the client, confirm the worker JavaScript and WASM return successful responses with appropriate JavaScript/WASM content types, session initialization succeeds, a live query changes after a command, and changing identity revokes the old session while the public shell stays mounted. A worker load failure, missing WASM, or denied browser storage is an initialization failure; repeated command clicks cannot repair it.

Reference the [browser API](/reference/browser) and [React API](/reference/react) for the actual public interfaces.
