import type { IAggregateAgentRelease } from '../../agent/types.ts';
import {
  projectSessionContracts,
  projectSessionModels,
} from '../../system/project/projectSessionFacts.ts';
import type { IAggregateSessionLock } from '../AggregateSessionLockSchema.ts';
import { getAggregateSessionModels } from '../executionDefinition.ts';
import type { IAggregateSessionDefinition } from '../types.ts';

export const makeAggregateSessionLock = (
  sessionDefinition:
    | Omit<IAggregateSessionDefinition, 'systemName'>
    | IAggregateAgentRelease,
): IAggregateSessionLock => {
  return {
    sessionName: sessionDefinition.sessionName,
    origin:
      'claimsSchema' in sessionDefinition
        ? {
            kind: 'actor',
            actorName: sessionDefinition.actorName,
            actorVersion: sessionDefinition.actorVersion,
          }
        : {
            kind: 'agent',
            agentName: sessionDefinition.agentName,
            agentVersion: sessionDefinition.agentVersion,
          },
    models: projectSessionModels(getAggregateSessionModels(sessionDefinition)),
    contracts: projectSessionContracts(sessionDefinition.contracts),
  };
};
