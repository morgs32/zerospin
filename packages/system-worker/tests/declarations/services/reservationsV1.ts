import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import { createReservationV1 } from '../contracts/createReservationV1.ts';
import { performReservationWorkV1 } from '../contracts/performReservationWorkV1.ts';
import {
  recordReservationObservation,
  recordReservationWorkV1,
} from '../contracts/recordReservationWorkV1.ts';
import { reservationV1 } from '../models/reservationV1.ts';
import { operatorV1 } from '../serviceActors/operatorV1.ts';

import { reservationService } from './reservationService.ts';

export const reservationsV1 = makeServiceRelease(reservationService, {
  version: 1,
  models: { reservation: reservationV1 },
  actors: {
    operator: operatorV1,
  },
  system: {
    createReservation: createReservationV1,
    performReservationWork: performReservationWorkV1,
  },
  contracts: { recordReservationObservation },
  external: { recordReservationWork: recordReservationWorkV1 },
});
