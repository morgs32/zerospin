import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

import { createTimedReservationV1 } from './createTimedReservationV1.ts';
import { observeTimeV1 } from './observeTimeV1.ts';

export const reservationsV1 = makeServiceRelease(reservationService, {
  version: 1,
  models: { reservation: reservationV1 },
  actors: {},
  system: {
    createTimedReservation: createTimedReservationV1,
    observeTime: observeTimeV1,
  },
  external: {},
});
