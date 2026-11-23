import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { turn } from '../gameV1';
import { savedPositionV2 } from '../savedPositionV2';

import { savePositionV1 } from './savePositionV1';

export const savePositionV2 = sdk.upgradeAggregateContractRelease(
  savePositionV1,
  {
    version: 2,
    payload: {},
    models: {
      savedPosition: {
        model: savedPositionV2,
        fields: ['createdAt', 'updatedAt', 'gameId', 'content'],
      },
    },
    operations: { createSavedPosition: savedPositionV2.operations.create },
    down: Effect.fn('savePositionV2.down')(function* (props) {
      const { payload } = props;
      return payload;
    }),
    program: Effect.fn('savePositionV2.program')(function* (props) {
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
          content: { board: current.board, turn: turn(current.board) },
        },
      });
    }),
  },
);
