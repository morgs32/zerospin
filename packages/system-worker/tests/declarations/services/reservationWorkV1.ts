import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import { performReservationWorkV1 } from '../contracts/performReservationWorkV1.ts';
import {
  recordReservationObservation,
  recordReservationWorkV1,
} from '../contracts/recordReservationWorkV1.ts';
import { reservationV1 } from '../models/reservationV1.ts';

import { reservationService } from './reservationService.ts';

export const reservationWorkV1 = makeServiceRelease(reservationService, {
  version: 1,
  models: { reservation: reservationV1 },
  actors: {},
  system: { performReservationWork: performReservationWorkV1 },
  contracts: { recordReservationObservation },
  external: { recordReservationWork: recordReservationWorkV1 },
});
