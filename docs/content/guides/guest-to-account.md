---
title: Keep guest state and hand it to an account
description: Create a current standalone browser session and make guest-to-account transfer an explicit, idempotent application workflow.
order: 10
---

## Prerequisites

Use a browser with the storage/SharedWorker support described in [the quickstart](/guides/quickstart), current browser packages, browser-safe model/ordinary-contract declarations, and an authenticated destination for the eventual import. A standalone session has local claims and storage but no backend admission or identity-provider authentication.

Stackshirts is a concrete product use case: visitors build a design before signing in, then save it to their account. Its design handoff is application-owned and expressed through declared import and clear commands. Use `makeStandaloneAggregateSession` for manual ownership, or `useStandaloneAggregateSession` with `SessionProvider` and `SessionReady` for React ownership.

## 1. Declare the local release

This small example reuses Tic Tac Toe's real `game` model and `createGame` contract to demonstrate a standalone creation, without a backend opponent. Place it alongside those definitions in the example if experimenting:

```ts title="src/guestGameSessionDefinition.ts — pure standalone session definition"
import { makeAggregateSessionDefinition } from '@zerospin/browser';
import { createGame } from './contracts/createGameV1';
import { claimsSchema, game } from './gameV1';

export const guestGameSessionDefinition = makeAggregateSessionDefinition({
  systemName: 'standalone',
  aggregateName: 'game',
  aggregateVersion: 1,
  actorName: 'guest',
  actorVersion: 1,
  sessionName: 'guestGame',
  claimsSchema,
  models: { game },
  contracts: { createGame },
});
```

For a design editor, declare the actual design models and ordinary edit contracts instead. Keep the release in its own file. No API URL, publishable key, or credential callback is required for standalone work. A custom application Layer is needed only if its programs require additional services.

## 2. Register the session definition in the worker

Standalone execution needs the same executable contracts in the SharedWorker. It cannot reconstruct them from serialized metadata:

```ts title="src/guest.worker.ts — Vite worker entry"
import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';
import { guestGameSessionDefinition } from './guestGameSessionDefinition';

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: guestGameSessionDefinition,
});
```

One worker entry registers one session definition. This is Vite asset handling; use [the Next asset boundary](/guides/react-and-nextjs) for a different host.

## 3. Bind a stable guest storage identity

Inside a browser-owned component, establish and retain a guest token, derive the game ID, and bind a backup path:

```tsx title="guest owner — using the definition above"
import { RoutePattern } from '@remix-run/route-pattern';
import {
  SessionProvider,
  SessionReady,
  useStandaloneAggregateSession,
} from '@zerospin/react';
import workerUrl from './guest.worker?sharedworker&url';
import { guestGameSessionDefinition } from './guestGameSessionDefinition';

// claims is { aggregateId: theRetainedGuestToken, instanceId: theGameId }.
function GuestWorkspace() {
  const session = useStandaloneAggregateSession(guestGameSessionDefinition, {
    sharedWorkerUrl: workerUrl,
    claims,
    backupPath: RoutePattern.parse('/guest-games/:aggregateId'),
  });
  return (
    <SessionProvider session={session}>
      <h1>Your local draft</h1>
      <SessionReady
        definition={guestGameSessionDefinition}
        fallback={<p>Opening the local draft…</p>}
        renderError={(error, retry) => (
          <section role="alert">
            <p>{error.message}</p>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </section>
        )}
      >
        <GuestEditor />
      </SessionReady>
    </SessionProvider>
  );
}
```

`GuestEditor` is your application component. It reads `GuestuseSession(gameSessionDefinition)`, queries `game`, and stages `createGame` through `stageAggregateSessionCommand` with `claims.instanceId`. The [first-feature guide](/guides/build-first-feature) shows that query and button logic. This local demonstration does not register `playX` or schedule O.

The path must begin with `/` and its parameters must resolve from the claims. Authored owner/actor/session scope plus this resolved path identify storage; changing every render's token means opening another draft. Optional `resources` supply initial rows for new/reset storage and must be complete typed resources, including framework fields.

## 4. Make account handoff an application contract

There is no automatic standalone-to-account merge API. The two sessions have different identities, ownership, and completion boundaries. Your application defines an authenticated import contract and a durable idempotency identity for each guest draft being imported.

Use this sequence, with authored commands for every domain change:

1. Capture the complete optimistic guest design and its stable source identity.
   Bind the destination account explicitly; refuse the action if that selection
   has changed.
2. Submit the destination import command synchronously through the public SDK.
   Its optimistic result identifies the imported design or the existing import.
   The contract validates relationships and owns idempotency for repeated imports.
3. After optimistic success, submit the guest clear command synchronously and use
   its immediate result. Keep any rejection visible so the action can be retried.
4. Select the account workspace and navigate using the optimistic result. Delivery,
   retention, replay, recovery and safe release belong inside Zerospin.

Do not wait for browser persistence, Node retention, synchronization or canonical
execution, and do not read command journals to coordinate this workflow. If the
framework cannot preserve submitted work during release, fix that lifecycle in
Zerospin rather than adding application waiters.

For designs containing stacks, shirts and tutorial progress, capture and validate
their relationships together. Define which IDs are preserved and which are
account-owned in the import contract. A plain database copy is not the public
application API.

## 5. Release or reset deliberately

Managed React hooks release their session on disable, replacement and unmount.
Keep both guest and account providers mounted while Keep/Discard chooses a design
workspace; authentication and design selection are separate application facts.
The public shell sits outside readiness gates and keeps its React identity.

For manually owned standalone sessions, `reset()` clears retained local state and
reinitializes the captured seed. It is not a substitute for an authored guest
clear command, an account import, or sign-out. Storage resets require authorization
for the affected storage. Ordinary handoff does not reset browser databases.

## Check recovery before shipping

Use your existing checks to exercise offline editing, reopening the same draft, two tabs sharing its scope, an account switch during transfer, duplicate import requests, an uncertain destination response, and a guest-clear rejection after successful optimistic import. Verify that none loses the sole draft or creates two account designs. Fixed-schema changes still require authorized empty disposable storage during this prerelease.

See [Sessions and synchronization](/handbook/sessions-and-synchronization), [Write commands](/guides/write-commands), and the [browser reference](/reference/browser).
