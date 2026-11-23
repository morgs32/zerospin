import type { IServiceAgentRelease } from '../agent/types.ts';
import {
  projectSessionContracts,
  projectSessionModels,
} from '../system/project/projectSessionFacts.ts';

import type { IServiceAgentSessionLock } from './ServiceAgentSessionLockSchema.ts';

export const makeServiceAgentSessionLock = (
  agent: IServiceAgentRelease,
): IServiceAgentSessionLock => ({
  sessionName: agent.sessionName,
  agentName: agent.agentName,
  agentVersion: agent.agentVersion,
  models: projectSessionModels(agent.db.models),
  contracts: projectSessionContracts(agent.contracts),
});
