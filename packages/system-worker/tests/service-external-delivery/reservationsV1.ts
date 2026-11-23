import { makeServiceContractExtension } from '@zerospin/core/contracts/makeServiceContractExtension';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';
import * as Effect from 'effect/Effect';

import { createReservationV1 } from '../declarations/contracts/createReservationV1.ts';
import { performReservationWorkV1 } from '../declarations/contracts/performReservationWorkV1.ts';
import { recordReservationWorkDefinitionV1 } from '../declarations/contracts/recordReservationWorkDefinitionV1.ts';
import {
  recordReservationObservation,
  recordReservationWorkV1,
} from '../declarations/contracts/recordReservationWorkV1.ts';
import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { operatorV1 } from '../declarations/serviceActors/operatorV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

import { externalProbeLayer } from './externalProbeControls.ts';
import {
  completeReservationProbe,
  failingProbeV1,
  probeReservationWorkV1,
  recordFailedProbeV1,
  rejectProbeObservation,
} from './probeReservationWorkV1.ts';

export const reservationsV1 = makeServiceRelease(reservationService, {
  version: 1,
  layer: externalProbeLayer(1),
  models: { reservation: reservationV1 },
  actors: {
    operator: operatorV1,
  },
  system: {
    createReservation: createReservationV1,
    performReservationWork: performReservationWorkV1,
  },
  extensions: {
    performReservationWork: makeServiceContractExtension(
      performReservationWorkV1,
      {
        models: {},
        operations: {
          record: recordReservationWorkDefinitionV1.externalOperation,
          update: reservationV1.operations.update,
        },
        program: Effect.fn(function* ({ operations, payload }) {
          if (payload.mode !== 'externalExtension') return;
          yield* operations.record({
            payload: { reservationId: payload.reservationId },
          });
          yield* operations.update({
            resourceId: payload.reservationId,
            attributes: { expiresAt: payload.expiresAt + 1 },
          });
        }),
      },
    ),
  },
  contracts: {
    recordReservationObservation,
    completeReservationProbe,
    recordFailedProbe: recordFailedProbeV1,
    rejectProbeObservation,
  },
  external: {
    recordReservationWork: recordReservationWorkV1,
    probeReservationWork: probeReservationWorkV1,
    failingProbe: failingProbeV1,
  },
});
