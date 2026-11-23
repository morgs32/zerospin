import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { accountAggregate } from '../declarations/aggregates/accountAggregate.ts';

import { accountV1 } from './accountV1.ts';
import { recordAggregateProbe } from './probeAggregateReservationWorkV1.ts';
import {
  probeAggregateReservationWorkV2,
  recordVersionedAggregateProbe,
} from './probeAggregateReservationWorkV2.ts';

export const accountV2 = makeAggregateRelease(accountAggregate, {
  version: 2,
  rebuildFrom: accountV1,
  models: {},
  actors: {},
  system: {},
  external: { probeAggregateReservationWork: probeAggregateReservationWorkV2 },
  contracts: { recordAggregateProbe, recordVersionedAggregateProbe },
});
