---
title: Inspect declarations and Cloud instances
description: Open the local Declaration Board and inspect active Cloud instance repositories.
order: 12
---

## Open the local Declaration Board

Run the CLI from the project directory containing `zerospin.config.ts`:

```sh
pnpm exec zerospin studio
```

Studio loads `.env.local`, then `.env`, and projects the authored system into
SystemSpec metadata in Node. A React Server Component passes the serialized
metadata to the shared Declaration Board. No running backend or Zerospin secret
key is required.

Pass `--port <number>` to select an integer port from 1 to 65535. The CLI uses
that argument before `PORT`, then defaults to `5555`. It binds to loopback and
fails if the selected port is occupied. Portless supplies the friendly URL used
for browser opening and CLI output. Without Portless, the default URL is
`http://127.0.0.1:5555`. Keep the CLI running while using the
board, and restart it after changing declarations. The CLI owns startup,
cancellation, and server disposal.

The left outline lists Aggregates and Services. Each outline link leads to its
section, with separate Actors, Agents, Models, and Contracts columns. The board
uses the docs app's typography and styling. Model **Fields** and
contract **Payload** disclosures provide compact lists; **View all** opens the
full field table.

## Inspect a Cloud instance

In the Zerospin Cloud customer console, select Organization → System → Instance
→ Studio. Its Declaration Board imports the same `@zerospin/system-diagrams`
package and displays the active deployment's artifact metadata.

Open Repos to browse registered repositories and their table rows. CloudApi
resolves the active deployment and keeps its credentials inside `apis`.
Development instances retain their Clerk-user ownership restriction. Historical
deployment definitions remain available separately; they do not represent a
historical snapshot of current Repo rows.

Opening Studio does not create model rows or start Agent callbacks. Those rows
come from domain command execution and replay. Trace pages and external
trace-provider links are deferred.

## Reuse the Declaration Board

Follow [Render system diagrams](/guides/system-diagrams) to import
`SystemDiagrams` into another React application. Generate
`sdk.makeSystemSpec({ system })` outside the browser and pass the metadata from
the application's server component or existing data-loading path.

Register independent Agent releases in `aggregateAgents` or `serviceAgents`,
scoped by owner and Agent name, with `{ releases, active }`. Each release binds
one exact owner name/version and serves as its own session definition. Studio
displays these declarations without opening browser Agent sessions.
See [Shopping's registration](https://github.com/morgs32/zerospin/blob/main/examples/shopping/src/zerospin/system.ts).

## Observe an Agent release

Applications that need a live public Agent view can explicitly create
`makeAggregateAgentSession` or `makeServiceAgentSession` from `@zerospin/browser`.
Supply the registered `agentRelease`, optional application `layer` and a
`bootstrap` callback returning its snapshot and WebSocket URL. Aggregate
observation requires `aggregateName`, `aggregateVersion` and a nonempty
`aggregateId`; Service observation requires `serviceName` and `serviceVersion`.
The bootstrap and snapshot must match that exact owner binding. These observers are
separate from the Declaration Board, which displays metadata without opening them.

Await initialization for the first validated replay. Read a declared selection
through the current `node.store.getState().view` and its
`readSelection(selection, identity)` method while the view is available, and await `dispose()` when the owning screen closes. The guarded reader
is revoked when its view is replaced, on terminal failure and on disposal.
Reconnect preserves the in-memory selected rows and checkpoint; allowed offline
retry can keep the last view visible with stale connection status.

Browser Agent observation cannot stage commands or schedule wakes. Authored
wake callbacks execute in AggregateAgentNodeRepo or
ServiceAgentNodeRepo. Opening or closing an observer does not start or stop them.
The Agent release declares its own command grants and exact owner binding.
See [the browser reference](/reference/browser#session-definitions) for the
observation surface and lifetime rules.

## Project Studio commands

Each configured project exposes `pnpm studio` independently of normal
application startup and `dev:app`. Workspace-root commands forward into the
backend directory containing the authored config. Fixed listeners and HTTPS
Portless origins are:

- QRK: `10030`, `studio.qrk.localhost`.
- Stackshirts: `11030`, `studio.stackshirts.localhost`.
- Shopping: `12030`, `studio.shopping.localhost`.
- Tic-tac-toe: `12031`, `studio.tic-tac-toe.localhost`.
- Zerospin Cloud: `13030`, `studio.cloud.localhost`.
- Mentor Mailbox: `14030`, `studio.mentormailbox.localhost`.
- Red Rope Parking: `15030`, `studio.redropeparking.localhost`.
