import { defineAggregateContract } from '@zerospin/core/contracts/defineAggregateContract';
import { defineServiceContract } from '@zerospin/core/contracts/defineServiceContract';
import { makeAggregateContractRelease } from '@zerospin/core/contracts/make/makeAggregateContractRelease';
import { makeServiceContractRelease } from '@zerospin/core/contracts/make/makeServiceContractRelease';
import { Effect } from 'effect';

/**
 * Favor explicit domain methods with one signature each; share internal construction.
 * Retain concrete family provenance in the definition and completed immutable contract.
 * Snapshot framework descriptor/enum/index/maps/spec metadata at construction;
 * retain referenced Effect codecs, callbacks, Table/Model, and service capabilities.
 * Canonical Model/Contract predicates require private completed-instance provenance,
 * rather than accepting an exported prototype alone. All authored version fields
 * use the shared positive-safe-integer VersionSchema; all identities are nonempty.
 * Aggregate callbacks receive framework aggregateId; service callbacks do not.
 * @bad Neutral authoring methods overloaded across aggregate and service domains.
 * @bad Claims or synthetic actor declarations used only to transport aggregate scope.
 */
export const aggregatePing = makeAggregateContractRelease(
  defineAggregateContract('ping'),
  {
    version: 1,
    payload: {},
    program: ({ aggregateId }) =>
      Effect.sync(() => {
        void aggregateId;
      }),
  },
);
export const servicePing = makeServiceContractRelease(
  defineServiceContract('ping'),
  {
    version: 1,
    payload: {},
  },
);
