import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

import { createReservationV1 } from './createReservationV1.ts';

const createReservationV2 = upgradeServiceContractRelease(createReservationV1, {
  version: 2,
  result: Schema.String,
  payload: {},
  operations: { createReservation: reservationV1.operations.create },
  program: ({ payload, operations }) =>
    Effect.gen(function* () {
      yield* operations.createReservation({
        resourceId: payload.reservationId,
        attributes: { expiresAt: payload.expiresAt },
      });
      return 'canonical';
    }),
});

export const reservationsV2 = makeServiceRelease(reservationService, {
  version: 2,
  models: { reservation: reservationV1 },
  actors: {},
  system: { createReservation: createReservationV2 },
  external: {},
});
