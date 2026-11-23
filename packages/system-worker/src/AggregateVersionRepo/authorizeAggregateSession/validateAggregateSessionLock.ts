import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeAggregateSessionLockKey } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLockKey';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { requireSupportedSessionLock } from '../../sessionLockValidation/requireSupportedSessionLock.js';

import { selectAggregateLockMembers } from './selectAggregateLockMembers.js';

/*
 * 1. Bind the exact actor and retain lock-key diagnostics.
 * 2. Select exact public models and contracts with operation-model closure.
 * 3. Compare the expected session, Actor, model and contract identities once.
 * A submitted lock only selects keys/versions; actor authority and claims
 * come from the running release. Resource visibility remains selection-owned.
 */
export const validateAggregateSessionLock = Effect.fn(
  'AggregateVersionRepo.validateAggregateSessionLock',
)(function* (props: {
  aggregateRelease: IAnyAggregateRelease;
  sessionName: string;
  aggregateSessionLock: IAggregateSessionLock;
}) {
  const { aggregateRelease, sessionName, aggregateSessionLock } = props;
  const aggregateSessionLockKey =
    yield* makeAggregateSessionLockKey(aggregateSessionLock);
  if (aggregateSessionLock.origin.kind !== 'actor') {
    return yield* makeZerospinError('actor-session-origin-required');
  }
  const actor = yield* getByKeyOrThrow({
    record: aggregateRelease.actors,
    key: aggregateSessionLock.origin.actorName,
    recordKind: 'actor',
  });
  if (actor.version !== aggregateSessionLock.origin.actorVersion) {
    return yield* makeZerospinError('actor-version-unsupported');
  }
  const selection = yield* selectAggregateLockMembers({
    aggregateRelease,
    actor,
    lock: aggregateSessionLock,
    lockKey: aggregateSessionLockKey,
  });
  const sessionSpec = makeAggregateSessionSpec({
    aggregateName: aggregateRelease.name,
    aggregateVersion: aggregateRelease.version,
    actorName: actor.name,
    actorVersion: actor.version,
    claimsSchema: actor.identity.claimsSchema,
    sessionName,
    ...selection,
    modelNames: Object.keys(selection.models).toSorted(),
  });
  yield* requireSupportedSessionLock({
    expected: sessionSpec.aggregateSessionLock,
    submitted: aggregateSessionLock,
    refuse: definitionPath =>
      makeZerospinError({
        code: 'aggregate-session-lock-unsupported',
        message:
          'The requested aggregate definition lock does not match the running System definitions',
        extra: {
          aggregateSession: {
            aggregateName: aggregateRelease.name,
            sessionName,
          },
          aggregateSessionLockKey,
          definitionPath,
          reason:
            definitionPath === 'lock.sessionName'
              ? 'session-mismatch'
              : 'definition-mutated',
        },
      }),
  });
  return {
    actor,
    sessionSpec: {
      ...sessionSpec,
      aggregateSessionLock: {
        ...sessionSpec.aggregateSessionLock,
        origin: aggregateSessionLock.origin,
      },
    },
  };
});
