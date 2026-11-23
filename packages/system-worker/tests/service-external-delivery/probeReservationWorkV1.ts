import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { defineServiceExternalContract } from '@zerospin/core/contracts/defineServiceExternalContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeServiceExternalContractRelease } from '@zerospin/core/contracts/make/makeServiceExternalContractRelease';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { reservationV1 } from '../declarations/models/reservationV1.ts';

import {
  ExternalProbe,
  externalProbePayloadBuilds,
  requestExternalProbe,
} from './externalProbeControls.ts';

const probeReservationWorkDefinitionV1 = defineServiceExternalContract({
  name: 'probeReservationWork',
  version: 1,
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

export const completeReservationProbe = makeServiceContractRelease(
  defineServiceContract('completeReservationProbe'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      observation: primitives.text(),
    },
  },
);

export const probeReservationWorkV1 = makeServiceExternalContractRelease(
  probeReservationWorkDefinitionV1,
  {
    request: Effect.fn(function* ({ payload }) {
      const { version } = yield* ExternalProbe;
      return yield* requestExternalProbe(version, payload);
    }),
    onSuccess: {
      contract: completeReservationProbe,
      payload: Effect.fn(function* ({ payload }) {
        externalProbePayloadBuilds.push(payload.reservationId);
        return {
          reservationId: payload.reservationId,
          observation: 'completed',
          ...(payload.reservationId === 'rsv_invalid_mapped_payload'
            ? { unexpected: true }
            : {}),
        };
      }),
    },
    onFailure: {
      contract: completeReservationProbe,
      payload: Effect.fn(function* ({ payload, failure }) {
        return {
          reservationId: payload.reservationId,
          observation: failure.code,
        };
      }),
    },
  },
);

export const recordFailedProbeV1 = makeServiceContractRelease(
  defineServiceContract('recordFailedProbe'),
  {
    version: 1,
    payload: { reservationId: primitives.id({ abbreviation: 'rsv' }) },
    operations: { create: reservationV1.operations.create },
    program: Effect.fn('recordFailedProbe')(function* (props) {
      const { payload, operations } = props;
      yield* operations.create({
        resourceId: payload.reservationId,
        attributes: { expiresAt: 999 },
      });
    }),
  },
);

export const rejectProbeObservation = makeServiceContractRelease(
  defineServiceContract('rejectProbeObservation'),
  {
    version: 1,
    payload: { reservationId: primitives.id({ abbreviation: 'rsv' }) },
    failures: {
      rejected: ContractError.schema({ code: 'fixture-continuation-failed' }),
    },
    program: ({ failures }) =>
      Effect.fail(
        failures.rejected.make({ message: 'fixture continuation failed' }),
      ),
  },
);

export const failingProbeV1 = makeServiceExternalContractRelease(
  defineServiceExternalContract({
    name: 'failingProbe',
    version: 1,
    payload: { reservationId: primitives.id({ abbreviation: 'rsv' }) },
    response: Schema.String,
  }),
  {
    request: () => Effect.succeed('received'),
    onSuccess: {
      contract: rejectProbeObservation,
      payload: Effect.fn(function* ({ payload }) {
        return { reservationId: payload.reservationId };
      }),
    },
    onFailure: {
      contract: recordFailedProbeV1,
      payload: Effect.fn(function* ({ payload }) {
        return { reservationId: payload.reservationId };
      }),
    },
  },
);
