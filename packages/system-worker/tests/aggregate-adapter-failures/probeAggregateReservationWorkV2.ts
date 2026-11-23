import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineAggregateExternalContract } from '@zerospin/core/contracts/defineAggregateExternalContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeAggregateExternalContractRelease } from '@zerospin/core/contracts/make/makeAggregateExternalContractRelease';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { requestAggregateExternalProbe } from './aggregateExternalProbeControls.ts';

export const recordVersionedAggregateProbe = makeAggregateContractRelease(
  defineAggregateContract('recordVersionedAggregateProbe'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      observation: primitives.text(),
    },
  },
);

const probeAggregateReservationWorkDefinitionV2 =
  defineAggregateExternalContract({
    name: 'probeAggregateReservationWork',
    version: 2,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      finalizer: primitives.boolean(),
    },
    response: Schema.Unknown,
  });

export const probeAggregateReservationWorkV2 =
  makeAggregateExternalContractRelease(
    probeAggregateReservationWorkDefinitionV2,
    {
      request: ({ payload }) => requestAggregateExternalProbe(2, payload),
      onSuccess: {
        contract: recordVersionedAggregateProbe,
        payload: Effect.fn(function* ({ payload, response }) {
          const observation = yield* Schema.decodeUnknownEffect(
            Schema.Struct({ providerVersion: Schema.Number }),
          )(response);
          return {
            reservationId: payload.reservationId,
            observation: `provider ${observation.providerVersion}`,
          };
        }),
      },
      onFailure: {
        contract: recordVersionedAggregateProbe,
        payload: Effect.fn(function* ({ payload, failure }) {
          return {
            reservationId: payload.reservationId,
            observation: failure.code,
          };
        }),
      },
    },
  );
