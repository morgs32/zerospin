import { runAuthoredCallback } from '@zerospin/core/execution/runAuthoredCallback';
import { AuthenticationPolicySchema } from '@zerospin/core/identity/AuthenticationPolicySchema';
import type {
  IAdmissionRequest,
  IServiceAuthentication,
} from '@zerospin/core/identity/types';
import type { IAnyServiceActorRelease } from '@zerospin/core/serviceActor/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** Validate the policy, authenticate once, and retain complete typed and encoded claims. */
export const authenticateServiceClaims = makeFn(
  'ServiceApi.authenticateServiceClaims',
)(function* (props: {
  actor: Pick<IAnyServiceActorRelease, 'identity'>;
  authentication: IServiceAuthentication;
  request: IAdmissionRequest;
}) {
  const { actor, authentication, request } = props;
  yield* Schema.decodeUnknownEffect(AuthenticationPolicySchema)(
    authentication,
    {
      onExcessProperty: 'error',
    },
  ).pipe(
    mapParseError({
      code: 'admission-policy-invalid',
      prefix: 'Invalid actor authentication policy',
    }),
  );
  const returned = yield* Effect.gen(function* () {
    if (authentication === 'none') {
      if (!('claims' in request)) {
        return yield* makeZerospinError('admission-claims-required');
      }
      return request.claims;
    }
    if (!('credentials' in request)) {
      return yield* makeZerospinError('admission-credentials-required');
    }
    const credentials = yield* Schema.decodeUnknownEffect(
      Schema.toType(authentication.credentialsSchema),
    )(request.credentials, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'authentication-credentials-invalid',
        prefix: 'Invalid authentication credentials',
      }),
    );
    return yield* runAuthoredCallback({
      code: 'service-authentication-failed',
      program: Effect.suspend(() =>
        authentication.authenticate({ credentials }),
      ),
    }).pipe(Effect.provide(NanoIdFactory));
  });
  const claims = yield* Schema.decodeUnknownEffect(
    Schema.toType(actor.identity.claimsSchema),
  )(returned, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'identity-result-invalid',
      prefix: 'Invalid identity result',
    }),
  );
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
