import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { agentAccountV1 } from '../declarations/aggregates/agentAccountV1.ts';
import { changeAggregateReservationV1 } from '../declarations/contracts/aggregate/changeAggregateReservationV1.ts';
import { expireAggregateReservationV1 } from '../declarations/contracts/aggregate/expireAggregateReservationV1.ts';
import { agentReservationV1 } from '../declarations/models/agentReservationV1.ts';

export const agentAccountV2 = makeAggregateRelease(
  { name: 'agentAccount' },
  {
    version: 2,
    branchFrom: agentAccountV1,
    models: { agentReservation: agentReservationV1 },
    actors: {},
    system: {
      changeAggregateReservation: changeAggregateReservationV1,
      expireAggregateReservation: expireAggregateReservationV1,
    },
    external: {},
  },
);
