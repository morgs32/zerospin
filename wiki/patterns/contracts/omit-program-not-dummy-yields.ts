import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';

/**
 * Payload-only contracts omit program; checked evaluation returns { operations: [], result: undefined }.
 * Omitted operations supplies no recording methods; omitted result persists as null.
 * @bad Repeat the factory default with a dummy authored callback.
 */
export const pingContract = makeAggregateContractRelease(
  defineAggregateContract('ping'),
  { version: 1, payload: {} },
);
