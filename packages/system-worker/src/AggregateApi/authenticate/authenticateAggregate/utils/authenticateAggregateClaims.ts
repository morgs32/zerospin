import type { IAnyAggregateActorRelease } from '@zerospin/core/aggregateActor/types';
import { runAuthoredCallback } from '@zerospin/core/execution/runAuthoredCallback';
import { AggregateAuthenticationSchema } from '@zerospin/core/identity/AggregateAuthenticationSchema';
import type {
  IAggregateAuthentication,
  IAggregateAuthenticationRequest,
} from '@zerospin/core/identity/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** Authenticate complete claims for the explicitly requested aggregate. */
export const authenticateAggregateClaims = Effect.fn(
  'AggregateApi.authenticateAggregateClaims',
)(function* (props: {
  actor: Pick<IAnyAggregateActorRelease, 'identity'>;
  authentication: IAggregateAuthentication;
  request: IAggregateAuthenticationRequest;
}) {
  const { actor, authentication, request } = props;

  // 1 — validate the authored policy and incoming credentials
  yield* Schema.decodeUnknownEffect(AggregateAuthenticationSchema)(
    authentication,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'admission-policy-invalid',
      prefix: 'Invalid actor authentication policy',
    }),
  );
  const credentials = yield* Schema.decodeUnknownEffect(
    Schema.toType(authentication.credentialsSchema),
  )(request.credentials, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'authentication-credentials-invalid',
      prefix: 'Invalid authentication credentials',
    }),
  );

  // 2 — authenticate once, then validate the server-produced complete claims
  const claims = yield* runAuthoredCallback({
    code: 'aggregate-authentication-failed',
    program: Effect.suspend(() =>
      authentication.authenticate({
        aggregateId: request.aggregateId,
        credentials,
      }),
    ),
  }).pipe(
    Effect.flatMap(value =>
      Schema.decodeUnknownEffect(Schema.toType(actor.identity.claimsSchema))(
        value,
        { onExcessProperty: 'error' },
      ).pipe(
        mapParseError({
          code: 'identity-result-invalid',
          prefix: 'Invalid identity result',
        }),
      ),
    ),
    Effect.provide(NanoIdFactory),
  );

  // 3 — require a valid aggregate ID matching the caller's explicit selection
  yield* Schema.decodeUnknownEffect(Schema.String)(claims.aggregateId).pipe(
    mapParseError({
      code: 'identity-aggregate-id-invalid',
      prefix: 'Claims must supply an aggregate ID',
    }),
  );
  if (claims.aggregateId !== request.aggregateId) {
    return yield* makeZerospinError({
      code: 'identity-aggregate-id-mismatch',
      message:
        'Authenticated aggregate ID does not match the requested aggregate',
    });
  }

  // 4 — retain encoded full claims for the authentication result
  const encodedClaims = yield* Schema.encodeEffect(actor.identity.claimsSchema)(
    claims,
  ).pipe(
    mapParseError({
      code: 'identity-result-invalid',
      prefix: 'Claims could not be encoded',
    }),
  );
  return { claims, encodedClaims };
});
