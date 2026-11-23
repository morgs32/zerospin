import { findFirst } from '@zerospin/sdk/browser';
import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

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
