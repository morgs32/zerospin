import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import { reservationV1 } from '../declarations/models/reservationV1.ts';
import { reservationService } from '../declarations/services/reservationService.ts';

export const reservationsV2 = makeServiceRelease(reservationService, {
  version: 2,
  models: { reservation: reservationV1 },
  actors: {},
  system: {},
  external: {},
});
