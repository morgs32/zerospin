import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { SystemRepos } from '../../repoServices/SystemRepos.js';
import { Initialized } from '../Initialized.js';

/** Resolve the exact declared Service Agent independently of automation selection. */
export const resolveRegisteredServiceAgentSelection = Effect.fn(
  'SystemApi.resolveRegisteredServiceAgentSelection',
)(function* (request: {
  serviceName: string;
  serviceVersion: number;
  agentName: string;
  agentVersion: number;
}) {
  const system = yield* getSystemSpec();
  const owner = system.services[request.serviceName];
  const release = owner?.releases[request.serviceVersion];
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
  return {
    agent,
    systemRepo,
    key: {
      systemId,
      serviceName: release.name,
      serviceVersion: release.version,
      agentName: agent.name,
      agentVersion: agent.agentVersion,
    },
  };
});
