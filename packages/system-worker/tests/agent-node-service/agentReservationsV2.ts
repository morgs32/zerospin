import { makeServiceRelease } from '@zerospin/core/service/make/makeServiceRelease';

import { changeServiceReservationV1 } from '../declarations/contracts/service/changeServiceReservationV1.ts';
import { expireServiceReservationV1 } from '../declarations/contracts/service/expireServiceReservationV1.ts';
import { agentReservationV1 } from '../declarations/models/agentReservationV1.ts';
import { agentReservationsV1 } from '../declarations/services/agentReservationsV1.ts';

export const agentReservationsV2 = makeServiceRelease(
  { name: 'agentReservations' },
  {
    version: 2,
    rebuildFrom: agentReservationsV1,
    models: { agentReservation: agentReservationV1 },
    actors: {},
    system: {
      changeServiceReservation: changeServiceReservationV1,
      expireServiceReservation: expireServiceReservationV1,
    },
    external: {},
  },
);
