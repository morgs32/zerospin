import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { accountAggregate } from '../declarations/aggregates/accountAggregate.ts';

import { observeTimeV1 } from './observeTimeV1.ts';

export const accountV1 = makeAggregateRelease(accountAggregate, {
  version: 1,
  models: {},
  actors: {},
  system: { observeTime: observeTimeV1 },
  external: {},
});
