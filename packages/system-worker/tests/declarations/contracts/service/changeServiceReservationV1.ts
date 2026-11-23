import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { agentReservationV1 } from '../../models/agentReservationV1.ts';

export const changeServiceReservationV1 = makeServiceContractRelease(
  defineServiceContract('changeServiceReservation'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'arv' }),
      expiresAt: primitives.integer(),
      action: primitives.enum({ values: ['create', 'update', 'delete'] }),
    },
    models: {
      agentReservation: {
        model: agentReservationV1,
        fields: ['createdAt', 'updatedAt', 'expiresAt'],
      },
    },
    operations: {
      createReservation: agentReservationV1.operations.create,
      updateReservation: agentReservationV1.operations.update,
      deleteReservation: agentReservationV1.operations.delete,
    },
    program: Effect.fn(function* ({ payload, operations }) {
      if (payload.action === 'delete') {
        yield* operations.deleteReservation({
          resourceId: payload.reservationId,
        });
      } else if (payload.action === 'update') {
        yield* operations.updateReservation({
          resourceId: payload.reservationId,
          attributes: { expiresAt: payload.expiresAt },
        });
      } else {
        yield* operations.createReservation({
          resourceId: payload.reservationId,
          attributes: { expiresAt: payload.expiresAt },
        });
      }
    }),
  },
);
