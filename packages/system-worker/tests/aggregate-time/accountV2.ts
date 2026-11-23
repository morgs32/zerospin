import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { accountAggregate } from '../declarations/aggregates/accountAggregate.ts';

import { accountV1 } from './accountV1.ts';
import { observeTimeV2 } from './observeTimeV2.ts';

export const accountV2 = makeAggregateRelease(accountAggregate, {
  version: 2,
  branchFrom: accountV1,
  models: {},
  actors: {},
  system: { observeTime: observeTimeV2 },
  external: {},
});
