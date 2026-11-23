import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import { createReservationV1 } from '../declarations/contracts/createReservationV1.ts';
import { performReservationWorkV1 } from '../declarations/contracts/performReservationWorkV1.ts';
import {
  recordReservationObservation,
  recordReservationWorkV1,
} from '../declarations/contracts/recordReservationWorkV1.ts';
import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { auditorV1 } from '../declarations/serviceActors/auditorV1.ts';
import { operatorV1 } from '../declarations/serviceActors/operatorV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

export const reservationsV1 = makeServiceRelease(reservationService, {
  version: 1,
  models: { reservation: reservationV1 },
  actors: {
    operator: operatorV1,
    auditor: auditorV1,
  },
  system: {
    createReservation: createReservationV1,
    performReservationWork: performReservationWorkV1,
  },
  contracts: { recordReservationObservation },
  external: { recordReservationWork: recordReservationWorkV1 },
});
