import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { gameModel } from '../gameModel';
import { claimsSchema, game } from '../gameV1';
import { savedPositionModel } from '../savedPositionModel';
import { savedPositionV1 } from '../savedPositionV1';

export const savePositionV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('savePosition'),
  {
    version: 1,
    models: {
      game: {
        model: game,
        fields: ['createdAt', 'updatedAt', 'board', 'computerMoveFailure'],
      },
      savedPosition: {
        model: savedPositionV1,
        fields: ['createdAt', 'updatedAt', 'gameId', 'content'],
      },
    },
    claims: claimsSchema,
    failures: {
      gameUnavailable: sdk.ContractError.schema({ code: 'game-unavailable' }),
    },
    payload: {
      gameId: sdk.modelId({ model: gameModel }),
      positionId: sdk.modelId({ model: savedPositionModel }),
    },
    guard: Effect.fn('savePositionV1.guard')(function* (props) {
      const { claims, payload, failures } = props;
      if (claims.instanceId !== payload.gameId) {
        return yield* failures.gameUnavailable.make();
      }
    }),
    operations: { createSavedPosition: savedPositionV1.operations.create },
    program: Effect.fn('savePositionV1.program')(function* (props) {
      const { db, payload, failures, operations } = props;
      const current = yield* sdk.findFirst({
        db,
        model: db.models.game,
        where: { id: { eq: payload.gameId } },
      });
      if (current === undefined) {
        return yield* failures.gameUnavailable.make();
      }
      yield* operations.createSavedPosition({
        resourceId: payload.positionId,
        attributes: {
          gameId: payload.gameId,
          content: { board: current.board },
        },
      });
    }),
  },
);
