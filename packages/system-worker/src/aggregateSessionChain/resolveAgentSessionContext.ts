import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';

/** Restore only the registered Agent's pinned owner and observer session context. */
export const resolveAgentSessionContext = Effect.fn(
  'AggregateSessionChain.resolveAgentSessionContext',
)(function* (key: Extract<IAggregateProjectionKey, { agentName: string }>) {
  const system = yield* System;
  const aggregateRelease =
    system.aggregates[key.aggregateName]?.releases[key.aggregateVersion];
  const agent =
    system.aggregateAgents[key.aggregateName]?.[key.agentName]?.releases[
      key.agentVersion
    ];
  if (
    agent === undefined ||
    agent.agentName !== key.agentName ||
    agent.agentVersion !== key.agentVersion ||
    agent.aggregateName !== aggregateRelease?.name ||
    agent.aggregateVersion !== aggregateRelease?.version ||
    aggregateRelease === undefined ||
    aggregateRelease.name !== key.aggregateName ||
    aggregateRelease.version !== key.aggregateVersion
  ) {
    return yield* makeZerospinError('agent-version-owner-unavailable');
  }
  return {
    agent,
    sessionName: agent.sessionName,
    origin: {
      kind: 'agent' as const,
      agentName: key.agentName,
      agentVersion: key.agentVersion,
    },
  };
});
