import { makeServiceContractExtension } from '@zerospin/core/contracts/makeServiceContractExtension';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import * as Effect from 'effect/Effect';

import { createReservationV1 } from '../declarations/contracts/createReservationV1.ts';
import { performReservationWorkV1 } from '../declarations/contracts/performReservationWorkV1.ts';
import {
  recordReservationObservation,
  recordReservationWorkV1,
} from '../declarations/contracts/recordReservationWorkV1.ts';
import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { capabilityViewerV1 } from '../declarations/serviceActors/capabilityViewerV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

export const reservationsV1 = makeServiceRelease(reservationService, {
  version: 1,
  models: { reservation: reservationV1 },
  extensions: {
    createReservation: makeServiceContractExtension(createReservationV1, {
      models: {},
      operations: { update: reservationV1.operations.update },
      program: Effect.fn(function* ({ payload, operations }) {
        yield* operations.update({
          resourceId: payload.reservationId,
          attributes: { expiresAt: payload.expiresAt + 1 },
        });
      }),
    }),
  },
  actors: {
    capabilityViewer: capabilityViewerV1,
  },
  system: {
    createReservation: createReservationV1,
    performReservationWork: performReservationWorkV1,
  },
  contracts: { recordReservationObservation },
  external: { recordReservationWork: recordReservationWorkV1 },
});
