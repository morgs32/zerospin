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

export const reservationsV2 = makeServiceRelease(reservationService, {
  version: 2,
  models: { reservation: reservationV1 },
  actors: {
    operator: operatorV2,
  },
  system: {
    createReservation: createReservationV1,
    performReservationWork: performReservationWorkV1,
  },
  contracts: { recordReservationObservation },
  external: { recordReservationWork: recordReservationWorkV1 },
});
