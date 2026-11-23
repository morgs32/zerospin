import { makeServiceAgentSessionLock } from '@zerospin/core/serviceAgentSession/makeServiceAgentSessionLock';
import type { IServiceAgentSessionLock } from '@zerospin/core/serviceAgentSession/ServiceAgentSessionLockSchema';
import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

/** A Service agent admits only its registered owner, session and complete authored capabilities. */
export const validateServiceAgentSessionLock = Effect.fn(
  'validateServiceAgentSessionLock',
)(function* (props: {
  serviceName: string;
  serviceVersion: number;
  agentName: string;
  agentVersion: number;
  sessionName: string;
  serviceAgentSessionLock: IServiceAgentSessionLock;
}) {
  const {
    serviceName,
    serviceVersion,
    agentName,
    agentVersion,
    sessionName,
    serviceAgentSessionLock,
  } = props;
  const system = yield* System;
  const versions = Object.hasOwn(system.services, serviceName)
    ? system.services[serviceName]?.releases
    : undefined;
  const release =
    versions !== undefined && Object.hasOwn(versions, serviceVersion)
      ? versions[serviceVersion]
      : undefined;
  const agent =
    system.serviceAgents[serviceName]?.[agentName]?.releases[agentVersion];
  if (
    agent === undefined ||
    agent.agentName !== agentName ||
    agent.agentVersion !== agentVersion ||
    agent.sessionName !== sessionName ||
    agent.serviceName !== release?.name ||
    agent.serviceVersion !== release?.version ||
    release?.name !== serviceName ||
    release.version !== serviceVersion ||
    !isEqual(makeServiceAgentSessionLock(agent), serviceAgentSessionLock)
  ) {
    return yield* makeZerospinError('service-agent-session-lock-invalid');
  }
  return agent;
});
