---
title: Authenticate and switch accounts
description: Verify credentials into actor claims, refresh tokens without changing identity, and clean up sessions on sign-out.
order: 7
---

## Prerequisites

You need an identity provider, a backend actor that verifies its credentials, and a browser session bound to that actor. This guide follows Shopping's real Clerk integration. Tic Tac Toe's anonymous localStorage identity is deliberately simpler and must not be reused for account authorization.

Shopping uses `clerkCredentialsSchema = Schema.Struct({ token: Schema.String })` and verified claims `{ clerkUserId }`. Its user aggregate actor also has `aggregateId`, which must match the verified Clerk subject.

## Verify on the backend

Configure **server-only** `CLERK_JWT_KEY` with your instance's PEM verification key and `CLERK_AUTHORIZED_PARTIES` with its allowed session origins. The [verification module](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/verifyClerkIdentity.ts) calls Clerk's `verifyToken`, checks the origin allowlist, and decodes the verified `sub` into a nonempty branded Clerk user ID.

The shopper actor derives claims from that verified value:

```ts title="shopperActorV1.ts — authentication"
authentication: {
  credentialsSchema: clerkCredentialsSchema,
  authenticate: ({ credentials }) =>
    verifyClerkIdentity(credentials).pipe(
      Effect.map(clerkUserId => ({ clerkUserId })),
    ),
},
```

`Effect.map` transforms the successful verified value. It cannot make an unverified browser-supplied user ID trustworthy. Keep the verification module and worker bindings out of the browser graph.

Actor selections use the derived ID; actor write guards recheck ownership against authoritative data. Authentication identifies the caller, while selections and guards decide what that caller may read and change. See [Actors and authorization](/handbook/actors-and-authorization).

## Request a fresh token when the session needs credentials

Shopping's authenticated route owns the following callback:

```ts title="_app._authenticated.tsx — credential callback"
import { makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

// getToken is returned by Clerk's useAuth() in the mounted route.
const getCredentials = () =>
  Effect.tryPromise({
    try: () => getToken(),
    catch: () => makeZerospinError('clerk-session-unavailable'),
  }).pipe(
    Effect.flatMap(token =>
      token === null
        ? Effect.fail(makeZerospinError('clerk-session-unavailable'))
        : Effect.succeed({ token }),
    ),
  );
```

`tryPromise` turns the provider Promise into an Effect with an explicit failure. `flatMap` lets the null-token branch fail and the valid-token branch produce the credential object. Do not capture one token once and reuse it indefinitely.

Pass this callback into each authenticated managed hook. The hook forwards the latest committed callback, so token refresh for the same identity does not require a new release or live instance.

## Redirect signed-out page requests before loading React

If the frontend can authenticate the document request, redirect before serving
the private page. Shopping's [Start entry](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/start.ts)
runs Clerk's request middleware, which verifies the session and handles Clerk's
handshake. The [authenticated layout](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/routes/_app._authenticated.tsx)
uses TanStack Start's server-side `beforeLoad` to call `auth()`. It redirects to
`/signin` with the original same-origin path and query when there is no signed-in
user. Sign-in and sign-up routes sit outside that layout. Supply Clerk's
publishable key and server-only secret to the frontend runtime.

Shopping uses `createIsomorphicFn().server(...)` for the check, which runs on
initial document requests without adding an authentication request to browser
navigation. Data-only SSR runs the route check while leaving the workspace UI
browser-rendered. Keep browser session-change handling and the actor's credential
verification in place. A valid Clerk session lets the user enter the frontend.
Zerospin verifies credentials and owns actor admission, selections, and writes.

On a static SPA, a hosting request handler must check Clerk before the shell is
returned. If a service worker serves cached HTML first, that navigation bypasses
the server. An offline-capable app can fetch the document online, cache immutable
assets, and use an unpersonalized shell when the network is unavailable.

## Replace the session when identity changes

The [authenticated route](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/routes/_app._authenticated.tsx)
observes Clerk's browser state and redirects if the active session ends. Its shopper and
catalog managed hooks share a fresh-credentials callback, publish both handles
through `SessionProvider`, and gate readers with `SessionReady`. Changed identity
updates hook options and replaces only the session generation; do not key the
public application subtree. Nonterminal failure observers are installed before
initialization through the hooks' third `{ onFailure }` argument.

If your app selects an aggregate or workspace, include that selection in the hook
options. A resolver returning an inactive value disables the session. A refreshed
credential callback changes without replacing the bound account/resource.

`expectedClaims` can bind known claims during construction. The backend still verifies credentials; expected claims are an identity assertion, not authority granted by the browser.

## Clear authentication on sign-out

For React-owned sessions, update the external identity and let the options become
inactive on sign-out. The managed hook fences the previous session and owns its
release. Do not gate sign-out, navigation or account changes on browser storage,
Node retention, transport or background delivery. Retained data is not an
authentication grant and is not automatically erased by disposal.

For manually owned browser sessions, explicit authentication revocation and
resource disposal remain responsibilities of that non-React owner; see
[the browser reference](/reference/browser#session-instance). Additional
browser-origin data-retention policy belongs to the application.

## Check the boundary

Run Shopping's current `ts`, `lint`, and `build` checks for source/build validation. For behavioral verification in your application, use contract and Workerd seams to exercise missing configuration, expired/invalid tokens, wrong authorized party, an aggregate ID inconsistent with the verified subject, and another shopper's cart. The current example does not provide a runnable authentication test suite. Shopping prohibits browser-driven verification.

For your own app, verify that switching accounts revokes the old session without remounting public UI, refreshing a token preserves the same identity, and sign-out cannot continue writes through an old view. Read [Sessions and synchronization](/handbook/sessions-and-synchronization) and [Failures and recovery](/handbook/failures-and-recovery) for interruption behavior.
