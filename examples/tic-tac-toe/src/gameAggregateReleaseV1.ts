import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';
import { makeZerospinError } from '@zerospin/error';
import { findFirst } from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { deterministicComputerMove } from './chooseComputerMove';
import {
  applyComputerMove,
  playExternalOMove,
} from './contracts/playExternalOMoveV1';
import { game } from './gameV1';
import { human } from './humanActorV1';
import { isValidMove } from './isValidMove';

export const aggregateRelease = makeAggregateRelease(
  defineAggregate({ name: 'game' }),
  {
    version: 1,
    layer: deterministicComputerMove,
    models: { game },
    external: { playExternalOMove },
    contracts: { applyComputerMove },
    actors: { human },
    guards: {
      human: {
        playX: Effect.fn('game.authoritativePlayX')(function* ({
          db,
          payload,
          claims,
        }) {
          const current = yield* findFirst({
            db,
            model: game,
            where: { id: { eq: payload.id } },
          });
          if (
            claims.instanceId !== payload.id ||
            !isValidMove(current?.board, payload, 'X')
          ) {
            return yield* makeZerospinError('invalid-move');
          }
        }),
      },
    },
  },
);
