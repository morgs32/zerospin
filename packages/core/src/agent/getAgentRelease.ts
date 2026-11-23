import { makeZerospinError } from '@zerospin/error';

import type { ISystem } from '../system/types.ts';

export function getAggregateAgentRelease(
  system: Pick<ISystem, 'aggregateAgents'>,
  key: {
    aggregateName: string;
    aggregateVersion: number;
    agentName: string;
    agentVersion: number;
  },
) {
  const agent =
    system.aggregateAgents[key.aggregateName]?.[key.agentName]?.releases[
      key.agentVersion
    ];
  if (
    agent === undefined ||
    agent.aggregateName !== key.aggregateName ||
    agent.aggregateVersion !== key.aggregateVersion
  ) {
    throw makeZerospinError('agent-version-owner-unavailable');
  }
  return agent;
}
export function getServiceAgentRelease(
  system: Pick<ISystem, 'serviceAgents'>,
  key: {
    serviceName: string;
    serviceVersion: number;
    agentName: string;
    agentVersion: number;
  },
) {
  const agent =
    system.serviceAgents[key.serviceName]?.[key.agentName]?.releases[
      key.agentVersion
    ];
  if (
    agent === undefined ||
    agent.serviceName !== key.serviceName ||
    agent.serviceVersion !== key.serviceVersion
  ) {
    throw makeZerospinError('agent-version-owner-unavailable');
  }
  return agent;
}
