import type { IAgentReleaseSpec } from '@zerospin/core/agent/AgentReleaseSpecSchema';
import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IServiceAgentSessionLock } from '@zerospin/core/serviceAgentSession/ServiceAgentSessionLockSchema';
import { mapValues } from 'es-toolkit';

function projectAgentSessionFacts(agent: IAgentReleaseSpec) {
  return {
    sessionName: agent.sessionName,
    models: mapValues(agent.models, ({ modelName, version }) => ({
      modelName,
      version,
    })),
    contracts: mapValues(agent.contracts, (version, commandName) => ({
      commandName,
      version,
    })),
  };
}

export function projectAggregateAgentSessionLock(
  agent: IAgentReleaseSpec,
): IAggregateSessionLock & {
  origin: Extract<IAggregateSessionLock['origin'], { kind: 'agent' }>;
} {
  return {
    ...projectAgentSessionFacts(agent),
    origin: {
      kind: 'agent',
      agentName: agent.name,
      agentVersion: agent.agentVersion,
    },
  };
}

export function projectServiceAgentSessionLock(
  agent: IAgentReleaseSpec,
): IServiceAgentSessionLock {
  return {
    ...projectAgentSessionFacts(agent),
    agentName: agent.name,
    agentVersion: agent.agentVersion,
  };
}
