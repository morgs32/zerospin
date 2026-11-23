import type {
  IAggregateAgentRelease,
  IServiceAgentRelease,
} from '@zerospin/core/agent/types';
import type { IAgentRegistry } from '@zerospin/core/system/types';
import { makeZerospinError, type IZerospinError } from '@zerospin/error';
import config from 'config';
import * as Effect from 'effect/Effect';

export function aggregateAgentReleaseInstallation(
  agent: IAggregateAgentRelease,
) {
  return {
    aggregateVersion: agent.aggregateVersion,
    agentVersion: agent.agentVersion,
  };
}

function serviceAgentReleaseInstallation(agent: IServiceAgentRelease) {
  return {
    serviceVersion: agent.serviceVersion,
    agentVersion: agent.agentVersion,
  };
}

function resolveSelectedInstallation<A, B>(
  registry: IAgentRegistry<A> | undefined,
  installation: (agent: A) => B,
): Effect.Effect<B | null, IZerospinError<'agent-owner-unavailable'>> {
  if (registry === undefined) return Effect.succeed(null);
  const agent = registry.releases[registry.active];
  if (agent === undefined) {
    return Effect.fail(makeZerospinError('agent-owner-unavailable'));
  }
  return Effect.succeed(installation(agent));
}

export function getAggregateAgentInstallation(key: {
  aggregateName: string;
  agentName: string;
}) {
  return resolveSelectedInstallation(
    config.system.aggregateAgents[key.aggregateName]?.[key.agentName],
    aggregateAgentReleaseInstallation,
  );
}

export function getServiceAgentInstallation(key: {
  serviceName: string;
  agentName: string;
}) {
  return resolveSelectedInstallation(
    config.system.serviceAgents[key.serviceName]?.[key.agentName],
    serviceAgentReleaseInstallation,
  );
}
