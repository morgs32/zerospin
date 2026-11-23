import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { findFirst } from '@zerospin/core/contracts/findFirst';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { agentReservationV1 } from '../../models/agentReservationV1.ts';

export const expireAggregateReservationV1 = makeAggregateContractRelease(
  defineAggregateContract('expireAggregateReservation'),
  {
    version: 1,
    payload: { reservationId: primitives.id({ abbreviation: 'arv' }) },
    models: {
      agentReservation: {
        model: agentReservationV1,
        fields: ['createdAt', 'updatedAt', 'expiresAt'],
      },
    },
    failures: {
      notSelected: ContractError.schema({ code: 'reservation-not-selected' }),
    },
    program: Effect.fn(function* ({ payload, db, failures }) {
      const selected = yield* findFirst({
        db,
        model: db.models.agentReservation,
        where: { id: { eq: payload.reservationId } },
      });
      if (selected === undefined) {
        return yield* failures.notSelected.make({
          message: 'Reservation is no longer selected',
        });
      }
    }),
  },
);
