import type { IAggregateSessionDefinition } from '../types.ts';

import { makeAggregateSessionLock } from './makeAggregateSessionLock.ts';

export function makeAggregateSessionSpec(
  definition: Omit<IAggregateSessionDefinition, 'systemName'>,
) {
  const aggregateSessionLock = makeAggregateSessionLock(definition);
  const modelNames: readonly string[] = definition.modelNames.toSorted();

  return {
    actorName: definition.actorName,
    actorVersion: definition.actorVersion,
    aggregateName: definition.aggregateName,
    sessionName: definition.sessionName,
    aggregateVersion: definition.aggregateVersion,
    modelNames,
    models: aggregateSessionLock.models,
    contracts: aggregateSessionLock.contracts,
    aggregateSessionLock,
  };
}

export type IAggregateSessionSpec = ReturnType<typeof makeAggregateSessionSpec>;
