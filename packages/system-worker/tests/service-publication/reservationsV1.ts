import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

import { createReservationV1 } from './createReservationV1.ts';

export const reservationsV1 = makeServiceRelease(reservationService, {
  version: 1,
  models: { reservation: reservationV1 },
  actors: {},
  system: { createReservation: createReservationV1 },
  external: {},
});
