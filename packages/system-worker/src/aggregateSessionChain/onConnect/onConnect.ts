import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { AgentOriginSchema } from '@zerospin/core/contracts/OriginSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';
import type { Connection } from 'partyserver';

import type { IAggregateProjectionKey } from '../../aggregateProjection/resolveAggregateProjectionView.js';
import type { IAggregateSessionConnectionState } from '../connectionState.js';
import { disposeConnection } from '../disposeConnection.js';
import { installConnection } from '../installConnection.js';
import { resolveAgentSessionContext } from '../resolveAgentSessionContext.js';

/** Decode forwarded admission, validate its exact owner, and install the awaiting-resume attachment. */
export const onConnect = Effect.fn('AggregateSessionChain.onConnect')(
  function (props: {
    connection: Connection<IAggregateSessionConnectionState>;
    request: Request;
    db: IDb;
    key: IAggregateProjectionKey;
  }) {
    const { connection, db, key, request } = props;
    const refuse = (reason: string) =>
      disposeConnection({ db, key, connection, code: 4004, reason });
    return Effect.gen(function* () {
      const aggregateSessionLockResult = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(AggregateSessionLockSchema),
      )(request.headers.get('x-zerospin-aggregate-session-lock'), {
        onExcessProperty: 'error',
      }).pipe(Effect.result);
      if (Result.isFailure(aggregateSessionLockResult)) {
        refuse('aggregate-session-lock-invalid');
        return;
      }
      const nodeIdentityResult = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.NullOr(Schema.NonEmptyString)),
      )(request.headers.get('x-zerospin-producer')).pipe(Effect.result);
      if (Result.isFailure(nodeIdentityResult)) {
        refuse('session-identity-invalid');
        return;
      }
      const lock = aggregateSessionLockResult.success;
      let claims: Readonly<Record<string, unknown>> | undefined;
      if ('actorName' in key) {
        if (
          lock.origin.kind !== 'actor' ||
          lock.origin.actorName !== key.actorName ||
          lock.origin.actorVersion !== key.actorVersion
        ) {
          refuse('actor-capability-mismatch');
          return;
        }
        const decodedClaims = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
        )(request.headers.get('x-zerospin-claims')).pipe(Effect.result);
        if (Result.isFailure(decodedClaims)) {
          refuse('session-identity-invalid');
          return;
        }
        claims = decodedClaims.success;
      } else {
        const originResult = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(AgentOriginSchema),
        )(request.headers.get('x-zerospin-origin'), {
          onExcessProperty: 'error',
        }).pipe(Effect.result);
        if (
          Result.isFailure(originResult) ||
          originResult.success.agentName !== key.agentName ||
          originResult.success.agentVersion !== key.agentVersion ||
          nodeIdentityResult.success === null
        ) {
          refuse('agent-capability-mismatch');
          return;
        }
        const context = yield* resolveAgentSessionContext(key).pipe(
          Effect.result,
        );
        if (
          Result.isFailure(context) ||
          !isEqual(makeAggregateSessionLock(context.success.agent), lock)
        ) {
          refuse('agent-capability-mismatch');
          return;
        }
      }
      yield* installConnection({
        db,
        key,
        connection,
        lock,
        admission: {
          phase: 'awaiting-resume',
          ...(claims === undefined ? {} : { claims }),
          issuedNodeId: nodeIdentityResult.success,
          aggregateVersion: key.aggregateVersion,
          aggregateId: key.aggregateId,
          aggregateName: key.aggregateName,
          sessionName: lock.sessionName,
        },
      });
    }).pipe(
      Effect.onExit(exit =>
        Exit.isFailure(exit)
          ? Effect.sync(() =>
              disposeConnection({
                db,
                key,
                connection,
                code: 1011,
                reason: 'aggregate-session-installation-failed',
              }),
            )
          : Effect.void,
      ),
    );
  },
);
