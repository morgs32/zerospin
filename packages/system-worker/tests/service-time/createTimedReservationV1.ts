import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

export const createTimedReservationV1 = makeServiceContractRelease(
  defineServiceContract('createTimedReservation'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      expiresAt: primitives.integer(),
    },
    models: {
      reservation: {
        model: reservation,
        fields: ['createdAt', 'updatedAt', 'expiresAt'],
      },
    },
    operations: { createReservation: reservation.operations.create },
    failures: {
      expired: ContractError.schema({ code: 'reservation-expired' }),
    },
    result: Schema.Struct({
      currentTimeMillis: Schema.Number,
      currentTimeNanos: Schema.String,
    }),
    program: Effect.fn(function* ({ payload, operations, failures }) {
      const currentTimeMillis = yield* Clock.currentTimeMillis;
      const currentTimeNanos = (yield* Clock.currentTimeNanos).toString();
      if (currentTimeMillis >= payload.expiresAt) {
        return yield* failures.expired.make({
          message: 'Reservation deadline has passed',
        });
      }
      yield* operations.createReservation({
        resourceId: payload.reservationId,
        attributes: { expiresAt: payload.expiresAt },
      });
      return { currentTimeMillis, currentTimeNanos };
    }),
  },
);
