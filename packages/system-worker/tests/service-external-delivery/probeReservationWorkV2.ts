import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { defineServiceExternalContract } from '@zerospin/core/contracts/defineServiceExternalContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeServiceExternalContractRelease } from '@zerospin/core/contracts/make/makeServiceExternalContractRelease';
import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  ExternalProbe,
  requestExternalProbe,
} from './externalProbeControls.ts';
import { completeReservationProbe } from './probeReservationWorkV1.ts';

export const completeReservationProbeV2 = upgradeServiceContractRelease(
  completeReservationProbe,
  {
    version: 2,
    payload: { providerVersion: primitives.integer() },
    up: ({ payload }) => Effect.succeed({ ...payload, providerVersion: 1 }),
    down: ({ payload: { providerVersion: _providerVersion, ...payload } }) =>
      Effect.succeed(payload),
  },
);

export const recordPinnedProbe = makeServiceContractRelease(
  defineServiceContract('recordPinnedProbe'),
  {
    version: 1,
    payload: { reservationId: primitives.id({ abbreviation: 'rsv' }) },
  },
);

const probeReservationWorkDefinitionV2 = defineServiceExternalContract({
  name: 'probeReservationWork',
  version: 2,
  payload: {
    reservationId: primitives.id({ abbreviation: 'rsv' }),
    mode: primitives.enum({
      values: ['success', 'failure', 'invalid-response', 'timeout'],
    }),
    finalizer: primitives.boolean(),
  },
  response: Schema.Unknown,
  timeoutMs: 500,
});

export const probeReservationWorkV2 = makeServiceExternalContractRelease(
  probeReservationWorkDefinitionV2,
  {
    request: Effect.fn(function* ({ payload }) {
      const { version } = yield* ExternalProbe;
      return yield* requestExternalProbe(version, payload);
    }),
    onSuccess: {
      contract: completeReservationProbeV2,
      payload: Effect.fn(function* ({ payload, response }) {
        const { version } = yield* ExternalProbe;
        if (version !== 2) {
          yield* Effect.die(new Error('Expected the reservations@2 Layer'));
        }
        const { providerVersion } = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ providerVersion: Schema.Number }),
        )(response);
        return {
          reservationId: payload.reservationId,
          observation: `provider ${providerVersion}`,
          providerVersion,
        };
      }),
    },
    onFailure: {
      contract: recordPinnedProbe,
      payload: Effect.fn(function* ({ payload }) {
        return {
          reservationId: payload.reservationId,
          ...(payload.reservationId === 'rsv_pinned_mapping_failure'
            ? { unexpected: true }
            : {}),
        };
      }),
    },
  },
);
