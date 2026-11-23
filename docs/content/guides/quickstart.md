---
title: Run your first Zerospin app
description: Run the current workspace Tic Tac Toe example and follow a command from the browser to its backend opponent.
order: 1
---

## Start with a working application

Zerospin lets your application read local SQLite and express changes as typed commands. The browser can show the predicted change immediately; the backend checks and executes the command authoritatively. This walkthrough uses **Tic Tac Toe**: you play X, and the backend plays O.

These guides document current, unreleased workspace source. Installing a published SDK version is not an equivalent quickstart. Keep the repository, examples, and packages on the same revision.

## Prerequisites

Use Node.js 24 or newer, pnpm 11.1.1, and a browser with SharedWorker, Web Locks, and origin-private file storage support. Run commands from the Zerospin repository root. Local development uses Wrangler's local Worker runtime; production deployment is a separate step.

```sh
git clone https://github.com/morgs32/zerospin.git
cd zerospin
pnpm install --frozen-lockfile
pnpm nx run @zerospin/cli:lib
pnpm install --frozen-lockfile
cp examples/tic-tac-toe/.env.example examples/tic-tac-toe/.env.local
```

The second install links the built workspace CLI executable on a fresh checkout. Review `examples/tic-tac-toe/.env.local`: `VITE_ZEROSPIN_API_URL` addresses the local backend and `VITE_ZEROSPIN_PUBLISHABLE_KEY` is the local publishable key. The example template supplies development defaults. Never put a secret key in a `VITE_` variable.

Before running the app, check the current example and its dependency build:

```sh
pnpm nx run tic-tac-toe:ts
pnpm nx run tic-tac-toe:build
```

If a workspace dependency fails to compile, resolve that source mismatch first. The current checkout is the source of truth; do not substitute an older registry SDK to get past the error.

## Start the backend and frontend

In one terminal:

```sh
pnpm nx run tic-tac-toe:zerospin:dev
```

Wait for the backend to finish accepting and initializing its System. In a second terminal:

```sh
pnpm nx run tic-tac-toe:dev
```

Open [the local board](http://localhost:3020). The API listens on port **3006**, and the Vite app on **3020**. A backend listening socket alone does not prove that the System is ready.

## Play and observe the two kinds of work

1. Choose **Start game**. `createGame` creates one game row in the local projection.
2. Choose an empty square. `playX` predicts X's move synchronously and changes the displayed turn to O.
3. Wait for O. Authoritative execution schedules `playExternalOMove`; the backend chooses a square and publishes the resulting row back to the session.
4. Finish the game. A completed game schedules no additional computer move. Choose **New game** to create a fresh anonymous identity.

The example stores its anonymous identity in localStorage. Anyone who knows that identity can play its human turn; this is a learning example, not an account authentication recipe. The backend opponent is retained work and can finish after the tab closes. Reopening the same game catches up with that work.

## Find the application pieces

| File under `examples/tic-tac-toe/src/`              | Your application responsibility                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `gameV1.ts`                                         | Model attributes, IDs, and claims schemas                                                      |
| `contracts/createGameV1.ts`, `contracts/playXV1.ts` | Browser-safe guards and operations                                                             |
| `humanActorV1.ts`                                   | Verified identity, selected rows, exposed contracts                                            |
| `gameAggregateReleaseV1.ts`, `system.ts`            | Backend owner and registered release                                                           |
| `gameSessionDefinition.ts`                          | Pure session definition, shared by connected and mock sessions                                 |
| `applicationLayer.ts`                               | Application services supplied to the managed session hook                                      |
| `app.tsx`                                           | Managed session hook/provider, local readiness gate, live query, buttons, and command failures |
| `router.tsx`, `routes/index.tsx`                    | Router creation and application route                                                          |

Read the [full example source](https://github.com/morgs32/zerospin/tree/main/examples/tic-tac-toe) alongside [Build your first feature](/guides/build-first-feature). For application context, the same pattern serves QRK's user-owned sites/pages, Red Rope Parking's member/partner data, and Stackshirts' designs; those repositories currently contain earlier integrations, so these guides use upstream APIs.

## If the app does not become ready

A missing publishable key, a wrong API URL, unavailable browser storage, or a failed backend initialization can prevent the board from loading. Read terminal errors and browser session failures before retrying commands. An invalid move is a business refusal; wait for the current board and choose a valid square.

Changed fixed schemas require empty disposable browser and backend storage. `--clean` deletes local backend Durable Object state:

```sh
pnpm nx run tic-tac-toe:zerospin:dev --clean
```

Use that command only for disposable development state, and clear this app origin's browser storage when its schema changed. See [Develop and deploy](/guides/develop-and-deploy) for the lifecycle and [Failures and recovery](/handbook/failures-and-recovery) for command outcomes.
