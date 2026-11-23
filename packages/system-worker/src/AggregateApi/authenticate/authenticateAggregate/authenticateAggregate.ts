import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import { System } from '@zerospin/core/system/System';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { makeActorSelection } from '../../../actorAdmission/utils/makeActorSelection.js';

import { authenticateAggregateClaims } from './utils/authenticateAggregateClaims.js';

/**
 * Authenticate one exact aggregate actor and derive its canonical partition path.
 *
 * 1. Resolve the requested aggregate and actor version.
 * 2. Authenticate and validate the complete claims for the requested aggregate ID.
 * 3. Validate canonical actor partition selection and retain complete claims.
 */
export const authenticateAggregate = makeFn(
  'AggregateApi.authenticateAggregate',
  {
    root: true,
  },
)(function* (props: {
  aggregateName: string;
  aggregateVersion: number;
  actorName: string;
  actorVersion: number;
  request: IAggregateAuthenticationRequest;
}) {
  const { aggregateName, aggregateVersion, actorName, actorVersion, request } =
    props;
  const system = yield* System;
  // 1 — resolve the requested aggregate and actor version
  const aggregateRelease =
    system.aggregates[aggregateName]?.releases[aggregateVersion];
  if (aggregateRelease === undefined) {
    return yield* Effect.fail(
      makeZerospinError('identity-aggregate-unavailable'),
    );
  }
  const actor = aggregateRelease.actors[actorName];
  if (actor === undefined || actor.version !== actorVersion) {
    return yield* makeZerospinError('actor-version-unsupported');
  }

  // 2 — authenticate and validate the complete claims for the requested aggregate ID
  const { claims, encodedClaims } = yield* authenticateAggregateClaims({
    actor,
    authentication: actor.authentication,
    request,
  });

  // 3 — validate canonical actor partition selection and retain complete claims
  const { actorPath } = yield* makeActorSelection({
    identity: actor.identity,
    claims,
  });
  return {
    claims: encodedClaims,
    actorName: actor.name,
    actorVersion: actor.version,
    actorPath,
    systemName: system.name,
  };
});
