import { findFirst } from '@zerospin/sdk/browser';
import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { gameModel } from '../gameModel';
import { claimsSchema, game, outcome } from '../gameV1';
import { isValidMove } from '../isValidMove';

import { playExternalOMoveDefinitionV1 } from './playExternalOMoveDefinitionV1';

export const playX = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('playX'),
  {
    version: 1,
    result: Schema.Null,
    models: {
      game: {
        model: game,
        fields: ['createdAt', 'updatedAt', 'board', 'computerMoveFailure'],
      },
    },
    claims: claimsSchema,
    failures: {
      invalidMove: sdk.ContractError.schema({ code: 'invalid-move' }),
    },
    payload: {
      id: sdk.modelId({ model: gameModel }),
      board: sdk.primitives.text(),
      square: sdk.primitives.integer(),
    },
    guard: Effect.fn('playX.guard')(function* ({
      failures,
      payload,
      claims,
      db,
    }) {
      const current = yield* findFirst({
        db,
        model: db.models.game,
        where: { id: { eq: payload.id } },
      });
      if (
        claims === null ||
        claims.instanceId !== payload.id ||
        !isValidMove(current?.board, payload, 'X')
      ) {
        return yield* failures.invalidMove.make({ extra: null });
      }
    }),
    operations: {
      updateGame: game.operations.update,
      playO: playExternalOMoveDefinitionV1.externalOperation,
    },
    program: Effect.fn('playX.program')(function* ({ payload, operations }) {
      const board =
        payload.board.slice(0, payload.square) +
        'X' +
        payload.board.slice(payload.square + 1);
      yield* operations.updateGame({
        resourceId: payload.id,
        attributes: { board },
      });
      if (outcome(board) === 'playing') {
        yield* operations.playO({ payload: { id: payload.id, board } });
      }
      return null;
    }),
  },
);
