import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeCommandOperation } from '@zerospin/core/contracts/makeCommandOperation';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import { primitives } from '@zerospin/shapes';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import { reservationService } from '../declarations/services/reservationService.ts';

import { dispatchServiceWorkV1 } from './dispatchServiceWorkV1.ts';
import { confirmReservation } from './reservationsV2.ts';

export const offsetPayloadBuildPrefix = 'chain-delivery/offset-payload-build/';

const completeReservation = makeServiceContractRelease(
  defineServiceContract('completeReservation'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      expiresAt: primitives.integer(),
      confirmation: primitives.integer(),
    },
  },
);
const recordReservationRefusal = makeServiceContractRelease(
  defineServiceContract('recordReservationRefusal'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      expiresAt: primitives.integer(),
      failureCode: primitives.text(),
    },
  },
);

const reserve = makeCommandOperation({
  destination: { service: reservationService, version: 2 },
  contract: confirmReservation,
  onSuccess: {
    contract: completeReservation,
    payload: Effect.fn('completeReservation.payload')(({ payload, success }) =>
      Effect.succeed({ ...payload, confirmation: success }),
    ),
  },
  onFailure: {
    contract: recordReservationRefusal,
    payload: Effect.fn('recordReservationRefusal.payload')(
      ({ payload, failure }) =>
        Effect.succeed({ ...payload, failureCode: failure.code }),
    ),
  },
});
const reserveWithOffset = makeCommandOperation({
  destination: reserve.destination,
  contract: reserve.contract,
  onSuccess: {
    contract: completeReservation,
    payload: Effect.fn('reserveWithOffset.payload')(function* ({
      payload,
      success,
    }) {
      yield* Effect.promise(() =>
        env.BUCKET.put(
          offsetPayloadBuildPrefix + crypto.randomUUID(),
          String(payload.expiresAt),
        ),
      );
      return {
        ...payload,
        confirmation: success + (payload.expiresAt === 60_001 ? 0.5 : 1),
      };
    }),
  },
  onFailure: {
    contract: recordReservationRefusal,
    payload: Effect.fn('recordReservationRefusal.payload')(
      ({ payload, failure }) =>
        Effect.succeed({ ...payload, failureCode: failure.code }),
    ),
  },
});
const dispatchWithContinuation = makeServiceContractRelease(
  defineServiceContract('dispatchWithContinuation'),
  {
    version: 1,
    payload: {
      reservationId: primitives.id({ abbreviation: 'rsv' }),
      expiresAt: primitives.integer(),
    },
    operations: { reserve, reserveWithOffset },
    program: Effect.fn(function* ({ payload, operations }) {
      if (payload.expiresAt > 0) {
        yield* operations.reserveWithOffset({ payload });
      } else {
        yield* operations.reserve({ payload });
      }
    }),
  },
);

export const dispatcherV1 = makeServiceRelease(
  { name: 'dispatcher' },
  {
    version: 1,
    models: {},
    actors: {},
    system: { dispatchWork: dispatchServiceWorkV1, dispatchWithContinuation },
    external: {},
    contracts: { completeReservation, recordReservationRefusal },
  },
);
