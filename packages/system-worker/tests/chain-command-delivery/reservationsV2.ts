import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { createReservationV1 } from '../declarations/contracts/createReservationV1.ts';
import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

export const confirmReservation = makeServiceContractRelease(
  defineServiceContract('confirmReservation'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      expiresAt: primitives.integer(),
    },
    result: Schema.NumberFromString,
    failures: {
      refused: ContractError.schema({ code: 'reservation-confirm-refused' }),
    },
    program: Effect.fn(function* ({ payload, failures }) {
      if (payload.expiresAt === -2) {
        return yield* failures.refused.make({
          message: 'Reservation could not be confirmed',
        });
      }
      return payload.expiresAt;
    }),
  },
);

export const reservationsV2 = makeServiceRelease(reservationService, {
  version: 2,
  models: { reservation: reservationV1 },
  actors: {},
  system: { createReservation: createReservationV1, confirmReservation },
  external: {},
});
