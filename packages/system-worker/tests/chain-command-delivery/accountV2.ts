import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { viewerV1 } from '../declarations/aggregateActors/viewerV1.ts';
import { accountAggregate } from '../declarations/aggregates/accountAggregate.ts';
import { receiveCommandV1 } from '../declarations/contracts/receiveCommandV1.ts';

import { accountV1 } from './accountV1.ts';
import { dispatchAggregateWorkV1 } from './dispatchAggregateWorkV1.ts';

export const accountV2 = makeAggregateRelease(accountAggregate, {
  version: 2,
  branchFrom: accountV1,
  models: {},
  actors: { viewer: viewerV1 },
  system: {
    receiveCommand: receiveCommandV1,
    dispatchWork: dispatchAggregateWorkV1,
  },
  external: {},
});
