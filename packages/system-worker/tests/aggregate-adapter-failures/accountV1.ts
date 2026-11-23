import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { viewerV1 } from '../declarations/aggregateActors/viewerV1.ts';
import { accountAggregate } from '../declarations/aggregates/accountAggregate.ts';

import {
  probeAggregateReservationWorkV1,
  recordAggregateProbe,
} from './probeAggregateReservationWorkV1.ts';

export const accountV1 = makeAggregateRelease(accountAggregate, {
  version: 1,
  models: {},
  actors: { viewer: viewerV1 },
  system: {},
  external: { probeAggregateReservationWork: probeAggregateReservationWorkV1 },
  contracts: { recordAggregateProbe },
});
