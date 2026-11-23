import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import * as Effect from 'effect/Effect';

export const receiveCommandV1 = makeAggregateContractRelease(
  defineAggregateContract('receiveCommand'),
  { version: 1, payload: {}, program: () => Effect.void },
);
