import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { changeAggregateReservationV1 } from '../contracts/aggregate/changeAggregateReservationV1.ts';
import { expireAggregateReservationV1 } from '../contracts/aggregate/expireAggregateReservationV1.ts';
import { agentReservationV1 } from '../models/agentReservationV1.ts';

export const agentAccountV1 = makeAggregateRelease(
  { name: 'agentAccount' },
  {
    version: 1,
    models: { agentReservation: agentReservationV1 },
    actors: {},
    system: {
      changeAggregateReservation: changeAggregateReservationV1,
      expireAggregateReservation: expireAggregateReservationV1,
    },
    external: {},
  },
);
