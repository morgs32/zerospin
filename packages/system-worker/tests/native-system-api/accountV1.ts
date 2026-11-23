import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { accountAggregate } from '../declarations/aggregates/accountAggregate.ts';
import { changeAggregateReservationV1 } from '../declarations/contracts/aggregate/changeAggregateReservationV1.ts';
import { expireAggregateReservationV1 } from '../declarations/contracts/aggregate/expireAggregateReservationV1.ts';
import { agentReservationV1 } from '../declarations/models/agentReservationV1.ts';

import { viewerV1 } from './viewerV1.ts';

export const accountV1 = makeAggregateRelease(accountAggregate, {
  version: 1,
  models: { agentReservation: agentReservationV1 },
  actors: { viewer: viewerV1 },
  system: {
    changeAggregateReservation: changeAggregateReservationV1,
    expireAggregateReservation: expireAggregateReservationV1,
  },
  external: {},
});
