import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { callActorRelease } from '../../ownerOperations/callActorRelease.js';
import {
  validateNativeAggregateActorSession,
  validateNativeServiceActorSession,
} from '../../ownerOperations/validateNativeActorSession.js';
import {
  projectAggregateAgentSessionLock,
  projectServiceAgentSessionLock,
} from '../../sessionLockValidation/projectAgentSessionLocks.js';

import type { ISessionAdmission } from './SessionAdmissionSchema.js';

/** Resolve authored authority once at issuance; stored tickets never reconstruct executable declarations. */
export const validateSessionAdmission = Effect.fn(
  'SystemRepo.validateSessionAdmission',
)(function* (admission: ISessionAdmission) {
  const spec = yield* getSystemSpec();
  if (admission.kind === 'serviceAgent') {
    const lock = admission.serviceAgentSessionLock;
    const agent =
      spec.services[admission.serviceName]?.agentVersions[lock.agentName]?.[
        lock.agentVersion
      ];
    if (
      agent === undefined ||
      agent.ownerReleaseVersion !== admission.serviceVersion ||
      !isEqual(projectServiceAgentSessionLock(agent), lock)
    ) {
      return yield* makeZerospinError('service-agent-session-lock-invalid');
    }
    return;
  }
  if (admission.kind === 'aggregateAgent') {
    const lock = admission.aggregateSessionLock;
    const agent =
      spec.aggregates[admission.aggregateName]?.agentVersions[
        lock.origin.agentName
      ]?.[lock.origin.agentVersion];
    if (
      agent === undefined ||
      agent.ownerReleaseVersion !== admission.aggregateVersion ||
      !isEqual(projectAggregateAgentSessionLock(agent), lock)
    ) {
      return yield* makeZerospinError('session-websocket-admission-invalid');
    }
    return;
  }
  if (admission.kind === 'aggregateActor') {
    const { aggregateName, aggregateVersion } = admission;
    const { actorName, actorVersion } = admission.aggregateSessionLock.origin;
    if (
      spec.aggregates[aggregateName]?.releases[aggregateVersion]?.actors[
        actorName
      ] !== actorVersion
    ) {
      return yield* makeZerospinError('session-websocket-admission-invalid');
    }
    return yield* callActorRelease({
      release: { aggregateName, aggregateVersion },
      local: validateNativeAggregateActorSession(admission),
      remote: (worker, systemId) =>
        worker.validateAggregateActorSession(systemId, admission),
    });
  }
  const { serviceName, serviceVersion } = admission;
  const { actorName, actorVersion } = admission.serviceSessionLock;
  if (
    spec.services[serviceName]?.releases[serviceVersion]?.actors[actorName] !==
    actorVersion
  ) {
    return yield* makeZerospinError('session-websocket-admission-invalid');
  }
  yield* callActorRelease({
    release: { serviceName, serviceVersion },
    local: validateNativeServiceActorSession(admission),
    remote: (worker, systemId) =>
      worker.validateServiceActorSession(systemId, admission),
  });
});
