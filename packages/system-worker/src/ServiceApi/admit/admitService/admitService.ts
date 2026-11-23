import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';

import { makeActorSelection } from '../../../actorAdmission/utils/makeActorSelection.js';

import { authenticateServiceClaims } from './utils/authenticateServiceClaims.js';

/** Authenticate one exact service actor and derive its canonical partition path. */
export const admitService = makeFn('ServiceApi.admitService', { root: true })(
  function* (props: {
    serviceName: string;
    serviceVersion: number;
    actorName: string;
    actorVersion: number;
    request: IAdmissionRequest;
  }) {
    const { serviceName, serviceVersion, actorName, actorVersion, request } =
      props;
    const system = yield* System;
    const serviceRelease =
      system.services[serviceName]?.releases[serviceVersion];
    if (serviceRelease === undefined) {
      return yield* makeZerospinError({
        code: 'identity-service-unavailable',
        message: 'The requested service version is unavailable',
      });
    }
    const actor = serviceRelease.actors[actorName];
    if (actor === undefined || actor.version !== actorVersion) {
      return yield* makeZerospinError('actor-version-unsupported');
    }
    const { claims, encodedClaims } = yield* authenticateServiceClaims({
      actor,
      authentication: actor.authentication,
      request,
    });
    const { actorPath } = yield* makeActorSelection({
      identity: actor.identity,
      claims,
    });
    return {
      claims: encodedClaims,
      actorPath,
      systemName: system.name,
    };
  },
);
