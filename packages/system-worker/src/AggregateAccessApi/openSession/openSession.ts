import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import * as SchemaIssue from 'effect/SchemaIssue';
import { isEqual } from 'es-toolkit';

import { AggregateSessionApi } from '../../AggregateSessionApi/AggregateSessionApi.js';
import { AggregateSessionApiFailure } from '../../AggregateSessionApi/AggregateSessionApiFailure/AggregateSessionApiFailure.js';
import type { IAggregateVersionRepo } from '../../AggregateVersionRepo/types.js';
import { requireDevelopmentSystemReady } from '../../developmentHistory.js';
import { rpcMethod } from '../../makeRpcApi/makeRpcApi.js';
import { AggregateVersionRepos } from '../../repoServices/AggregateVersionRepos.js';
import { Initialized } from '../Initialized.js';

// Preserve the distinct outer-request and nested-lock refusal codes.
const RequestShape = Schema.Struct({
  sessionName: Schema.String,
  aggregateSessionLock: Schema.Unknown,
  expectedClaims: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
});

/** Open the named session after checking the authenticated Actor and session lock. */
export const openSession = rpcMethod({
  name: 'AggregateAccessApi.openSession',
  schema: Schema.Struct({
    ...RequestShape.fields,
    aggregateSessionLock: AggregateSessionLockSchema,
  }),
  parseError: (error, input) => {
    const outerValid = Option.isSome(
      Schema.decodeUnknownOption(RequestShape)(input, {
        onExcessProperty: 'error',
      }),
    );
    return makeZerospinError({
      code: outerValid
        ? 'aggregate-session-lock-invalid'
        : 'aggregate-authorization-arguments-invalid',
      message: `${outerValid ? 'Invalid aggregate definition lock' : 'Invalid aggregate authorization arguments'}: ${SchemaIssue.makeFormatterDefault()(error.issue)}`,
    });
  },
})(
  function* (validated) {
    const { sessionName, aggregateSessionLock, expectedClaims } = validated;
    const access = yield* Initialized;
    const { authenticatedActor } = access;
    if (
      expectedClaims !== undefined &&
      !isEqual(expectedClaims, authenticatedActor.claims)
    ) {
      return yield* makeZerospinError({
        code: 'session-claims-mismatch',
        message: 'Expected claims do not match authenticated session claims',
      });
    }
    if (
      aggregateSessionLock.origin.kind !== 'actor' ||
      aggregateSessionLock.origin.actorName !== authenticatedActor.actorName ||
      aggregateSessionLock.origin.actorVersion !==
        authenticatedActor.actorVersion
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'actor-capability-mismatch',
          message:
            'Session lock differs from the authenticated Actor selection',
        }),
      );
    }
    const claims = authenticatedActor.claims;
    const aggregateId = yield* Schema.decodeUnknownEffect(Schema.String)(
      claims.aggregateId,
    ).pipe(
      mapParseError({
        code: 'identity-aggregate-id-invalid',
        prefix: 'Invalid authenticated aggregate ID',
      }),
    );
    yield* requireDevelopmentSystemReady();
    const aggregateRepo = yield* (yield* AggregateVersionRepos).getRepo({
      key: {
        systemId: env.ZEROSPIN_SYSTEM_ID,
        aggregateId,
        aggregateName: access.aggregateName,
        aggregateVersion: access.aggregateVersion,
      },
    });
    const sessionSpec = yield* Effect.promise<
      Awaited<ReturnType<IAggregateVersionRepo['authorizeAggregateSession']>>
    >(() =>
      aggregateRepo.authorizeAggregateSession({
        sessionName,
        aggregateSessionLock,
        claims,
      }),
    ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
    return {
      aggregateVersion: access.aggregateVersion,
      aggregateId,
      aggregateName: access.aggregateName,
      claims,
      actorName: authenticatedActor.actorName,
      actorVersion: authenticatedActor.actorVersion,
      actorPath: authenticatedActor.actorPath,
      aggregateSessionLock: sessionSpec.aggregateSessionLock,
      sessionName,
      systemId: env.ZEROSPIN_SYSTEM_ID,
    };
  },
  {
    onSuccess: state => new AggregateSessionApi(state),
    onFailure: failure => new AggregateSessionApiFailure(failure),
  },
);
