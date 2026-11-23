import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import * as Clock from 'effect/Clock';
import * as Schema from 'effect/Schema';

export const observeTimeV1 = makeAggregateContractRelease(
  defineAggregateContract('observeTime'),
  {
    version: 1,
    payload: {},
    result: Schema.Number,
    program: () => Clock.currentTimeMillis,
  },
);
