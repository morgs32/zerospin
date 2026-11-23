import { resolveServiceActorVersion } from '@zerospin/core/serviceActor/getServiceActorVersion';
import { makeServiceSessionLockKey } from '@zerospin/core/serviceSession/make/makeServiceSessionLockKey';
import { makeServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { requireSupportedSessionLock } from '../../../../sessionLockValidation/requireSupportedSessionLock.js';

import { selectServiceLockMembers } from './selectServiceLockMembers.js';

/*
 * 1. Bind the exact release/actor and retain lock-key diagnostics.
 * 2. Select exact public contracts and models from the actor's declared view.
 * 3. Compare the expected session, Actor, model and contract identities once.
 * Admission authentication and resource authorization retain their own boundaries.
 */
export const validateServiceSessionLock = Effect.fn(
  'ServiceAccessApi.validateServiceSessionLock',
)(function* (props: {
  serviceName: string;
  serviceVersion: number;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
}) {
  const system = yield* System;
  const { serviceName, serviceVersion, sessionName, serviceSessionLock } =
    props;
  const serviceSessionLockKey =
    yield* makeServiceSessionLockKey(serviceSessionLock);
  const versions = Object.hasOwn(system.services, serviceName)
    ? system.services[serviceName]?.releases
    : undefined;
  const serviceRelease =
    versions !== undefined && Object.hasOwn(versions, serviceVersion)
      ? versions[serviceVersion]
      : undefined;
  if (serviceRelease === undefined) {
    return yield* makeZerospinError({
      code: 'service-session-lock-unsupported',
      message:
        'The requested service definition owner is unavailable in the active System',
      extra: {
        serviceSession: { serviceName, sessionName },
        serviceSessionLockKey,
        definitionPath: `services.${serviceName}`,
        reason: 'owner-missing',
      },
    });
  }
  const actor = yield* resolveServiceActorVersion(
    { [serviceRelease.version]: serviceRelease },
    serviceSessionLock,
  );
  const selection = yield* selectServiceLockMembers({
    actor,
    lock: serviceSessionLock,
    lockKey: serviceSessionLockKey,
    serviceName,
  });
  const sessionSpec = makeServiceSessionSpec({
    kind: 'service',
    serviceName,
    serviceVersion,
    sessionName,
    actorName: actor.name,
    actorVersion: actor.version,
    claimsSchema: actor.identity.claimsSchema,
    ...selection,
    modelNames: Object.keys(selection.models).toSorted(),
  });
  yield* requireSupportedSessionLock({
    expected: sessionSpec.serviceSessionLock,
    submitted: serviceSessionLock,
    refuse: definitionPath =>
      makeZerospinError({
        code: 'service-session-lock-unsupported',
        message:
          'The requested service definition lock does not match the running System definitions',
        extra: {
          serviceSession: { serviceName, sessionName },
          serviceSessionLockKey,
          definitionPath,
          reason:
            definitionPath === 'lock.sessionName'
              ? 'target-mismatch'
              : 'definition-mutated',
        },
      }),
  });
  return {
    serviceRelease,
    serviceSessionLock: sessionSpec.serviceSessionLock,
    sessionSpec,
    actor,
  };
});
