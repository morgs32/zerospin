---
title: Build your first feature
description: Follow Tic Tac Toe's model, contracts, actor, release, System, session, and React UI from source.
order: 3
---

## Work in the runnable Tic Tac Toe example

Complete [the quickstart](/guides/quickstart) first. Open `examples/tic-tac-toe`; this guide walks its real source rather than asking you to assemble an untested sample application. The feature owns one game row and accepts two public commands: create the game and play X. A backend-only continuation plays O.

The defining files are deliberately separate. Each model/contract version has its own file, and the session definition is a named export. Import those definitions directly instead of adding a `models.ts` or `contracts.ts` declaration barrel.

## 1. Define the local row

`src/gameV1.ts` gives the row a stable model identity and attributes:

```ts title="src/gameModel.ts"
import * as sdk from '@zerospin/sdk/browser';

export const gameModel = sdk.defineModel({ name: 'game', abbreviation: 'gam' });
```

```ts title="src/gameV1.ts — model declaration"
import * as sdk from '@zerospin/sdk/browser';
import { Schema } from 'effect';

import { gameModel } from './gameModel';

export const game = sdk.makeModelVersion(gameModel, {
  version: 1,
  attributes: {
    board: sdk.primitives.text(),
    computerMoveFailure: sdk.primitives.text({ nullable: true }),
  },
  indexes: [],
});

export const claimsSchema = Schema.Struct({
  aggregateId: Schema.String,
  instanceId: Schema.String,
});
export const credentialsSchema = Schema.Struct({ instanceId: Schema.String });
```

The `gam_` resource ID identifies the row. The aggregate ID identifies the owner instance; they are different identities. The example prefixes its stored anonymous token with `sdk.prefixId(game, token)` to make the game resource ID. See [Models and IDs](/handbook/models-and-ids).

The board is nine characters: `.` means empty. `outcome()` in the same source file checks the eight winning lines and determines `playing`, a winner, or `draw`.

## 2. Create a typed command

This is the complete `src/contracts/createGameV1.ts` declaration:

```ts title="src/contracts/createGameV1.ts"
import { findFirst } from '@zerospin/sdk/browser';
import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { gameModel } from '../gameModel';
import { claimsSchema, game } from '../gameV1';

export const createGame = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('createGame'),
  {
    version: 1,
    models: { game: { model: game, fields: [] } },
    claims: claimsSchema,
    failures: {
      invalidMove: sdk.ContractError.schema({ code: 'invalid-move' }),
    },
    payload: { id: sdk.modelId({ model: gameModel }) },
    guard: Effect.fn('createGame.guard')(function* ({
      failures,
      payload,
      claims,
      db,
    }) {
      if (
        claims === null ||
        payload.id !== claims.instanceId ||
        (yield* findFirst({ db, model: db.models.game })) !== undefined
      ) {
        return yield* failures.invalidMove.make({ extra: null });
      }
    }),
    operations: { createGame: game.operations.create },
    program: ({ payload, operations }) =>
      operations.createGame({
        resourceId: payload.id,
        attributes: {
          board: '.........',
          computerMoveFailure: null,
        },
      }),
  },
);
```

An **Effect** describes a computation. `Effect.fn` names it for diagnostics, and `yield*` runs an Effect inside its generator. The guard reads the invocation database and refuses an invalid command through a declared failure. Its empty field list grants an ID-only read, which is enough to check whether a game exists. It does not perform a network request.

The named map `operations: { createGame: game.operations.create }` declares exact create permission. Calling the injected `operations.createGame` method returns an **Effect** that validates, snapshots and records the deferred mutation. The program returns only its domain result, which is void here. Checked evaluation returns `{ operations, result }` and applies nothing. The surrounding workflow encodes the result and applies the complete batch in its transaction; an omitted result codec retains null.

## 3. Make stale writes explicit

`src/contracts/playXV1.ts` accepts `{ id, board, square }`. The submitted board is the caller's observed state. Its guard reads the current row and calls `isValidMove` to require the same board, X's turn, a playing game, a square from 0 through 8, and an empty square.

After the guard succeeds, its complete mutation program is:

```ts title="src/contracts/playXV1.ts — named operations and program"
operations: { updateGame: game.operations.update },
program: ({ payload, operations }) => {
  const board =
    payload.board.slice(0, payload.square) +
    'X' +
    payload.board.slice(payload.square + 1);
  return operations.updateGame({
    resourceId: payload.id,
    attributes: { board },
  });
},
```

Use the [full contract](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/contracts/playXV1.ts) and [shared move rule](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/isValidMove.ts) from the checked-out example. A second tab's stale move fails rather than silently overwriting a newer board. Browser staging and authoritative execution both enforce the rule.

## 4. Give the actor an identity and selected view

`src/humanActorV1.ts` creates a query database containing `game`, then an actor identity whose path is `/:aggregateId/:instanceId`. Its authentication returns claims from the requested aggregate and supplied anonymous game identity. Its selection is:

```ts title="src/humanActorV1.ts — selected game"
selections: {
  game: db.query.game.findMany({
    where: { id: { eq: identity.sql.placeholder('instanceId') } },
  }),
},
```

Here `db`, `identity`, and the registered contracts are the named definitions in the [complete actor file](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/humanActorV1.ts). The actor exposes `{ createGame, playX, playExternalOMove }`. An authenticated product should verify a real identity provider instead of trusting an anonymous token; follow [Authentication](/guides/authenticate).

## 5. Register the owner and System

`src/gameAggregateReleaseV1.ts` registers the model, actor, ordinary creation and X commands, and the external O implementation under `game@1`. Its authoritative `human.playX` guard rechecks the game and move against owner state before execution.

The System registers the authored Aggregate release.

```ts title="src/system.ts"
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { aggregateRelease } from './gameAggregateReleaseV1';

export const system = makeSystem({
  name: 'tic-tac-toe',
  aggregates: { game: { releases: { 1: aggregateRelease } } },
});
```

`zerospin.config.ts` supplies this System, its `systemId`, and the deterministic computer-move provider layer. A **Layer** supplies runtime dependencies; replacing that provider changes how O is chosen without changing public X commands. See [Releases and systems](/handbook/releases-and-systems).

## 6. Bind the browser to the same public declarations

`src/gameSessionDefinition.ts` constructs the pure checked release shared by the tab and application worker: System name, aggregate and actor names/versions, models, public contracts, and claims. It imports the same ordinary `playX` used by the backend, including its pure external descriptor; provider code and the O continuation stay in backend modules.

The pure definition is imported directly by the managed React hook, its readers
and the application worker. Host options and the application layer remain separate.
`useConnectedAggregateSession` starts its browser resources after commit and owns
replacement and release. Connection opens the module SharedWorker from
`sharedWorkerUrl` using the known declaration/backend scope and requested aggregate
ID. The SharedWorker authenticates the attachment and selects its identity-specific
Node/database; the page does not fetch a discovery snapshot.
[React and Next.js](/guides/react-and-nextjs) explains browser bundling and client boundaries.

## 7. Read and write inside the React owner

The mounted owner supplies host inputs to the hook, then publishes its handle:

```tsx title="src/app.tsx — owner"
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

// claims, id and Board are established by this application, as in its full source.
function GameOwner() {
  const session = useConnectedAggregateSession(gameSessionDefinition, {
    sharedWorkerUrl: workerUrl,
    credentialsSchema,
    layer: applicationLayer,
    aggregateId: claims.aggregateId,
    expectedClaims: claims,
    getCredentials: () => Effect.succeed({ instanceId: id }),
  });
  return (
    <SessionProvider session={session}>
      <h1>Tic-Tac-Toe</h1>
      <SessionReady
        definition={gameSessionDefinition}
        fallback={<p>Connecting…</p>}
        renderError={(error, retry) => (
          <section role="alert">
            <p>{error.message}</p>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </section>
        )}
      >
        <Board />
      </SessionReady>
    </SessionProvider>
  );
}
```

These values and the application-local `Board` component are established in the [full application](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/app.tsx). Inside `Board`, read the session from the provider, query the local row, and submit a move:

```tsx title="src/app.tsx — inside Board"
import { useLiveQuery, useSession } from '@zerospin/react';

const gameSession = useSession(gameSessionDefinition);
const { data: current } = useLiveQuery({
  session: gameSession,
  query: db => db.query.game.findFirst({ where: { id: { eq: id } } }),
});

// In the square's click handler, after checking that current is present:
const result = sdk.stageAggregateSessionCommand({
  session: gameSession,
  contractName: 'playX',
  payload: { id, board: current.board, square },
});
setError(result._tag === 'Failure' ? result.failure.message : null);
```

`SessionReady` prevents database readers from mounting before readiness and withdraws them if readiness is lost; the heading remains mounted. `useSession(gameSessionDefinition)` reads only the matching ready session. `useLiveQuery` observes committed local changes. Staging returns synchronously: Success means the optimistic tab transaction committed, not that O has played or the backend finalized X. The session then hands that occurrence to the Node and server; later failures reconcile the view.

## 8. Add the retained backend opponent

The ordinary `playX` program records its game update and an O request together,
using `playExternalOMoveDefinitionV1.externalOperation`. The pure definition owns
payload/response codecs and imports no provider. Completed games record no O work.
Browser staging validates the full batch and applies only the X update. Original
canonical execution freezes the request under the originating aggregate instance
and release with the source changes and `outcome`.

Backend `playExternalOMove` consumes that exact pure definition, requests a square
from `ChooseComputerMove`, then validates the recorded response against the current
board, turn and identity before recording O's update. Both actor and owner register
the ordinary `playX` object directly. Provider code and the recorded continuation
remain in the backend graph.

Read [the ordinary X move](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/contracts/playXV1.ts),
[the pure O definition](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/contracts/playExternalOMoveDefinitionV1.ts)
and [the external continuation](https://github.com/morgs32/zerospin/blob/main/examples/tic-tac-toe/src/contracts/playExternalOMoveV1.ts),
then follow [Server and external work](/guides/server-and-external-work).

## Check the result

Run `pnpm nx run tic-tac-toe:ts` and `pnpm nx run tic-tac-toe:build`. The visible outcome is a reactive board with immediate X prediction and a later authoritative O move. Two stale competing moves cannot both overwrite the same board. Completed games have no new O work. A changed identity remounts the owner, while an interrupted connection resumes the retained game.

Do not resubmit an uncertain command as a new action merely because a response is late. Read the [command lifecycle guide](/guides/write-commands) before building retry buttons. Fixed-schema edits in this prerelease require empty development storage.
