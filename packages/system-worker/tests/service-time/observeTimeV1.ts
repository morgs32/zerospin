import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import * as Clock from 'effect/Clock';
import * as Schema from 'effect/Schema';

export const observeTimeV1 = makeServiceContractRelease(
  defineServiceContract('observeTime'),
  {
    version: 1,
    payload: {},
    result: Schema.Number,
    program: () => Clock.currentTimeMillis,
  },
);
