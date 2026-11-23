import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import { changeServiceReservationV1 } from '../contracts/service/changeServiceReservationV1.ts';
import { expireServiceReservationV1 } from '../contracts/service/expireServiceReservationV1.ts';
import { agentReservationV1 } from '../models/agentReservationV1.ts';

export const agentReservationsV1 = makeServiceRelease(
  { name: 'agentReservations' },
  {
    version: 1,
    models: { agentReservation: agentReservationV1 },
    actors: {},
    system: {
      changeServiceReservation: changeServiceReservationV1,
      expireServiceReservation: expireServiceReservationV1,
    },
    external: {},
  },
);
