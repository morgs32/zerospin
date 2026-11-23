import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { reservationV1 as reservation } from '../models/reservationV1.ts';

export const createReservationV1 = makeServiceContractRelease(
  defineServiceContract('createReservation'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      expiresAt: primitives.integer(),
    },
    operations: { createReservation: reservation.operations.create },
    failures: {
      refused: ContractError.schema({ code: 'reservation-create-refused' }),
    },
    program: Effect.fn(function* ({ payload, operations, failures }) {
      if (payload.expiresAt === -2) {
        return yield* failures.refused.make({
          message: 'Destination refused reservation',
        });
      }
      yield* operations.createReservation({
        resourceId: payload.reservationId,
        attributes: { expiresAt: payload.expiresAt },
      });
    }),
  },
);
