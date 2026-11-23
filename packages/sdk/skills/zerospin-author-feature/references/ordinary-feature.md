# Ordinary create command

This reduced Tic Tac Toe example uses the public SDK/browser entrypoint. Reuse
the application's canonical model and claims definitions when they already
exist. The fences below are separate defining files.

The existing example actor accepts an anonymous game identity, not an account
sign-in. In an authenticated application, the actor must derive these claims
from verified credentials; declaring a claims schema grants no authority.

```ts title="src/gameModel.ts"
import * as sdk from '@zerospin/sdk/browser';

export const gameModel = sdk.defineModel({ name: 'game', abbreviation: 'gam' });
```

```ts title="src/gameV1.ts"
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
```

```ts title="src/contracts/createGameV1.ts"
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
        (yield* sdk.findFirst({ db, model: db.models.game })) !== undefined
      ) {
        return yield* failures.invalidMove.make({ extra: null });
      }
    }),
    operations: { createGame: game.operations.create },
    program: ({ payload, operations }) =>
      operations.createGame({
        resourceId: payload.id,
        attributes: { board: '.........', computerMoveFailure: null },
      }),
  },
);
```

The payload ID is a `gam_` resource ID. `claims.aggregateId` identifies the owner
instance; `claims.instanceId` selects this actor's game row. The guard refuses a
different row identity or repeated creation. Its read scope is `models`; its
mutation permission is the named `operations.createGame` method. That method
returns a recording Effect, and the omitted result codec means void completion.

Turn and game result derive from the board; they are not stored attributes.
`computerMoveFailure` independently retains the current computer request's
failure message. The shared Model has five SQL fields (id, createdAt, updatedAt,
board and computerMoveFailure); complete resources retain bound modelName/version
through the existing Model codecs. The ordinary guard reads the Actor-selected
instance, so it does not impose one Game resource per Aggregate.

A handled computer-request Failure preserves that board and records its message;
it does not retry automatically. A successful O continuation updates the board
and clears the message. Both application hosts show the retained Failure and
offer New game with a separate Game identity.

## Register the same declaration

- Add the canonical `game` model and `createGame` contract to the intended actor's
  database, selected view and explicit capability as applicable. Its authenticated
  identity must determine the selected game row.
- Add those same definitions and that actor to the existing aggregate release.
  Preserve other registrations. The ordinary guard is evaluated authoritatively;
  add a separate owner guard only for additional owner policy.
- Add that same `createGame` object to the existing browser session's public
  contracts. The actor, owner and browser all use one ordinary declaration and
  program, including when it records command or pure external operations.
- Register the release under its exact name/version in `makeSystem`. Import
  `defineAggregate`, `makeAggregateRelease`, `makeSystem` and `makeConfig` from
  `@zerospin/sdk` in backend files. Retain the application's stable `systemId`.

Use existing application type/build checks for declaration and browser-import
coherence. Behavioral success is one creation; a repeated or unauthorized
creation must refuse without applying a mutation. Compilation alone does not
prove that behavior.

Source basis: SDK `36.0.0`;
`examples/tic-tac-toe/src/gameV1.ts`, `contracts/createGameV1.ts`,
`humanActorV1.ts`, `gameAggregateReleaseV1.ts`, `gameSessionDefinition.ts`, and
`packages/system-worker/src/AggregateVersionRepo/utils/evaluateAggregateCommand.ts`.
