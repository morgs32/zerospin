import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import { createReservationV1 } from '../declarations/contracts/createReservationV1.ts';
import { performReservationWorkV1 } from '../declarations/contracts/performReservationWorkV1.ts';
import {
  recordReservationObservation,
  recordReservationWorkV1,
} from '../declarations/contracts/recordReservationWorkV1.ts';
import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { operatorV2 } from '../declarations/serviceActors/operatorV2.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

import { externalProbeLayer } from './externalProbeControls.ts';
import {
  completeReservationProbeV2,
  probeReservationWorkV2,
  recordPinnedProbe,
} from './probeReservationWorkV2.ts';

const recordFailedProbeV2 = makeServiceContractRelease(
  defineServiceContract('recordFailedProbe'),
  { version: 2, payload: {} },
);
const failingProbeV2 = makeServiceContractRelease(
  defineServiceContract('failingProbe'),
  { version: 2, payload: {} },
);

export const reservationsV2 = makeServiceRelease(reservationService, {
  version: 2,
  layer: externalProbeLayer(2),
  models: { reservation: reservationV1 },
  actors: {
    operator: operatorV2,
  },
  system: {
    createReservation: createReservationV1,
    performReservationWork: performReservationWorkV1,
    recordFailedProbe: recordFailedProbeV2,
    failingProbe: failingProbeV2,
  },
  contracts: {
    recordReservationObservation,
    completeReservationProbe: completeReservationProbeV2,
    recordPinnedProbe,
  },
  external: {
    recordReservationWork: recordReservationWorkV1,
    probeReservationWork: probeReservationWorkV2,
  },
});
