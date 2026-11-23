import { System } from '@zerospin/core/system/System';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { makeActorSelection } from '../actorAdmission/utils/makeActorSelection.js';
import { validateAggregateSessionLock } from '../AggregateVersionRepo/authorizeAggregateSession/validateAggregateSessionLock.js';
import { validateServiceSessionLock } from '../ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock.js';
import type { ISessionAdmission } from '../SystemRepo/sessionWebSocketTickets/SessionAdmissionSchema.js';

export type IAggregateActorSessionAdmission = Extract<
  ISessionAdmission,
  { kind: 'aggregateActor' }
>;
export type IServiceActorSessionAdmission = Extract<
  ISessionAdmission,
  { kind: 'serviceActor' }
>;

const decodeClaims = <A extends Readonly<Record<string, unknown>>>(
  claims: unknown,
  schema: Schema.Codec<A>,
) =>
  Schema.decodeUnknownEffect(schema)(claims, {
    onExcessProperty: 'error',
    concurrency: 1,
  }).pipe(
    mapParseError({
      code: 'session-websocket-admission-invalid',
      prefix: 'Invalid session claims',
    }),
  );

/** Prove the requested session and its canonical Actor path against the release's declarations. */
export const validateNativeAggregateActorSession = Effect.fn(
  'validateNativeAggregateActorSession',
)(function* (admission: IAggregateActorSessionAdmission) {
  const { aggregateName, aggregateVersion, aggregateSessionLock } = admission;
  const system = yield* System;
  const aggregateRelease =
    system.aggregates[aggregateName]?.releases[aggregateVersion];
  if (aggregateRelease === undefined) {
    return yield* makeZerospinError('session-websocket-admission-invalid');
  }
  const { actor } = yield* validateAggregateSessionLock({
    aggregateRelease,
    sessionName: aggregateSessionLock.sessionName,
    aggregateSessionLock,
  });
  const claims = yield* decodeClaims(
    admission.claims,
    actor.identity.claimsSchema,
  );
  const { actorPath } = yield* makeActorSelection({
    identity: actor.identity,
    claims,
  });
  if (
    actorPath !== admission.actorPath ||
    claims.aggregateId !== admission.aggregateId
  ) {
    return yield* makeZerospinError('session-websocket-admission-invalid');
  }
});

export const validateNativeServiceActorSession = Effect.fn(
  'validateNativeServiceActorSession',
)(function* (admission: IServiceActorSessionAdmission) {
  const { serviceName, serviceVersion, serviceSessionLock } = admission;
  const { actor } = yield* validateServiceSessionLock({
    serviceName,
    serviceVersion,
    sessionName: serviceSessionLock.sessionName,
    serviceSessionLock,
  });
  const claims = yield* decodeClaims(
    admission.claims,
    actor.identity.claimsSchema,
  );
  const { actorPath } = yield* makeActorSelection({
    identity: actor.identity,
    claims,
  });
  if (actorPath !== admission.actorPath) {
    return yield* makeZerospinError('session-websocket-admission-invalid');
  }
});
