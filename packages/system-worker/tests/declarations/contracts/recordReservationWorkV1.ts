import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeServiceExternalContractRelease } from '@zerospin/core/contracts/make/makeServiceExternalContractRelease';
import { makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { recordReservationWorkDefinitionV1 as recordReservationWorkDefinition } from './recordReservationWorkDefinitionV1.ts';

export const recordReservationWorkRequests: string[] = [];
export const recordReservationWorkFailures = new Set<string>();

export const resetRecordReservationWork = () => {
  recordReservationWorkRequests.length = 0;
  recordReservationWorkFailures.clear();
};

export const recordReservationObservation = makeServiceContractRelease(
  defineServiceContract('recordReservationObservation'),
  {
    version: 1,
    payload: {
      ...recordReservationWorkDefinition.payload,
      observation: primitives.enum({ values: ['Success', 'Failure'] }),
    },
    result: Schema.Literals(['Success', 'Failure']),
    program: ({ payload }) => Effect.succeed(payload.observation),
  },
);

export const recordReservationWorkV1 = makeServiceExternalContractRelease(
  recordReservationWorkDefinition,
  {
    request: ({ payload }) =>
      Effect.suspend(() => {
        recordReservationWorkRequests.push(payload.reservationId);
        return recordReservationWorkFailures.has(payload.reservationId)
          ? Effect.fail(
              makeZerospinError({
                code: 'external-request-failed',
                message: 'Reservation provider refused the request',
              }),
            )
          : Effect.succeed(null);
      }),
    onSuccess: {
      contract: recordReservationObservation,
      payload: Effect.fn(function* ({ payload }) {
        return { ...payload, observation: 'Success' as const };
      }),
    },
    onFailure: {
      contract: recordReservationObservation,
      payload: Effect.fn(function* ({ payload }) {
        return { ...payload, observation: 'Failure' as const };
      }),
    },
  },
);
