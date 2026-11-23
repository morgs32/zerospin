import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineAggregateExternalContract } from '@zerospin/core/contracts/defineAggregateExternalContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeAggregateExternalContractRelease } from '@zerospin/core/contracts/make/makeAggregateExternalContractRelease';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { requestAggregateExternalProbe } from './aggregateExternalProbeControls.ts';

export const recordAggregateProbe = makeAggregateContractRelease(
  defineAggregateContract('recordAggregateProbe'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      observation: primitives.text(),
    },
  },
);

export const probeAggregateReservationWorkDefinitionV1 =
  defineAggregateExternalContract({
    name: 'probeAggregateReservationWork',
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      finalizer: primitives.boolean(),
    },
    response: Schema.Unknown,
  });

export const probeAggregateReservationWorkV1 =
  makeAggregateExternalContractRelease(
    probeAggregateReservationWorkDefinitionV1,
    {
      request: ({ payload }) => requestAggregateExternalProbe(1, payload),
      onSuccess: {
        contract: recordAggregateProbe,
        payload: Effect.fn(function* ({ payload }) {
          return {
            reservationId: payload.reservationId,
            observation: 'completed',
          };
        }),
      },
      onFailure: {
        contract: recordAggregateProbe,
        payload: Effect.fn(function* ({ payload, failure }) {
          return {
            reservationId: payload.reservationId,
            observation: failure.code,
          };
        }),
      },
    },
  );
