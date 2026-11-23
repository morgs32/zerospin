import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { Initialized } from '../Initialized.js';

/** Resolve the exact declared Aggregate Agent independently of automation selection. */
export const resolveRegisteredAggregateAgentSelection = Effect.fn(
  'SystemApi.resolveRegisteredAggregateAgentSelection',
)(function* (request: {
  aggregateName: string;
  aggregateVersion: number;
  aggregateId: string;
  agentName: string;
  agentVersion: number;
}) {
  const system = yield* getSystemSpec();
  const owner = system.aggregates[request.aggregateName];
  const release = owner?.releases[request.aggregateVersion];
  const agent = owner?.agentVersions[request.agentName]?.[request.agentVersion];
  if (
    release === undefined ||
    agent === undefined ||
    agent.ownerReleaseVersion !== release.version
  ) {
    return yield* makeZerospinError('agent-unavailable');
  }
  const { systemId } = yield* Initialized;
  const systemRepo = yield* (yield* SystemRepos).getRepo({ key: { systemId } });
  const registered = yield* Effect.promise(() =>
    systemRepo.hasAggregate({
      aggregateName: request.aggregateName,
      aggregateId: request.aggregateId,
    }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  if (!registered) {
    return yield* makeZerospinError('agent-aggregate-not-registered');
  }
  return {
    agent,
    systemRepo,
    key: {
      systemId,
      aggregateName: release.name,
      aggregateVersion: release.version,
      aggregateId: request.aggregateId,
      agentName: agent.name,
      agentVersion: agent.agentVersion,
    },
  };
});
