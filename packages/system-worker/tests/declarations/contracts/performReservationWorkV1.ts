import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

import { reservationV1 as reservation } from '../models/reservationV1.ts';

import { recordReservationWorkDefinitionV1 as recordReservationWorkDefinition } from './recordReservationWorkDefinitionV1.ts';

export let reservationWorkEvaluations = 0;

export const resetReservationWorkEvaluations = () => {
  reservationWorkEvaluations = 0;
};

export const performReservationWorkV1 = makeServiceContractRelease(
  defineServiceContract('performReservationWork'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      expiresAt: primitives.integer(),
      mode: primitives.enum({ values: ['success', 'noop', 'failure'] }),
    },
    failures: {
      refused: ContractError.schema({ code: 'reservation-work-refused' }),
    },
    operations: {
      createReservation: reservation.operations.create,
      recordReservationWork: recordReservationWorkDefinition.externalOperation,
      updateReservation: reservation.operations.update,
    },
    program: Effect.fn(function* ({ payload, operations, failures }) {
      reservationWorkEvaluations += 1;
      if (payload.mode === 'noop') return;
      yield* operations.createReservation({
        resourceId: payload.reservationId,
        attributes: { expiresAt: payload.expiresAt },
      });
      if (payload.mode === 'failure') {
        return yield* failures.refused.make({
          message: 'Reservation work was refused',
        });
      }
      yield* operations.recordReservationWork({
        payload: { reservationId: payload.reservationId },
      });
      yield* operations.updateReservation({
        resourceId: payload.reservationId,
        attributes: { expiresAt: payload.expiresAt + 1 },
      });
    }),
  },
);
