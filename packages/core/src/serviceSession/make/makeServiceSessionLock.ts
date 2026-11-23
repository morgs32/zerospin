import {
  projectSessionContracts,
  projectSessionModels,
} from '../../system/project/projectSessionFacts.ts';
import type { IServiceSessionLock } from '../ServiceSessionLockSchema.ts';
import type { IServiceSessionDefinition } from '../types.ts';

export const makeServiceSessionLock = (
  sessionDefinition: Omit<IServiceSessionDefinition, 'systemName'>,
): IServiceSessionLock => ({
  sessionName: sessionDefinition.sessionName,
  actorName: sessionDefinition.actorName,
  actorVersion: sessionDefinition.actorVersion,
  models: projectSessionModels(sessionDefinition.models),
  contracts: projectSessionContracts(sessionDefinition.contracts),
});
