import { ServiceSessionLockSchema } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import * as SchemaIssue from 'effect/SchemaIssue';
import { isEqual } from 'es-toolkit';

import { requireDevelopmentSystemReady } from '../../developmentHistory.js';
import { rpcMethod } from '../../makeRpcApi/makeRpcApi.js';
import { ServiceSessionApi } from '../../ServiceSessionApi/ServiceSessionApi.js';
import { ServiceSessionApiFailure } from '../../ServiceSessionApi/ServiceSessionApiFailure/ServiceSessionApiFailure.js';
import { Initialized } from '../Initialized.js';

import { authorizeServiceSession } from './authorizeServiceSession/authorizeServiceSession.js';

// Preserve the distinct outer-request and nested-lock refusal codes.
const RequestShape = Schema.Struct({
  sessionName: Schema.String,
  serviceSessionLock: Schema.Unknown,
  expectedClaims: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
});

/** Validate input before admission; construct the capability after optional telemetry delivery. */
export const authorize = rpcMethod({
  name: 'ServiceAccessApi.authorize',
  schema: Schema.Struct({
    ...RequestShape.fields,
    serviceSessionLock: ServiceSessionLockSchema,
  }),
  parseError: (error, input) => {
    const outerValid = Option.isSome(
      Schema.decodeUnknownOption(RequestShape)(input, {
        onExcessProperty: 'error',
      }),
    );
    return makeZerospinError({
      code: outerValid
        ? 'service-session-lock-invalid'
        : 'service-authorization-arguments-invalid',
      message: `${outerValid ? 'Invalid service definition lock' : 'Invalid service authorization arguments'}: ${SchemaIssue.makeFormatterDefault()(error.issue)}`,
    });
  },
})(
  function* (validated) {
    const { sessionName, serviceSessionLock, expectedClaims } = validated;
    const access = yield* Initialized;
    const { admitted } = access;
    if (
      expectedClaims !== undefined &&
      !isEqual(expectedClaims, admitted.claims)
    ) {
      return yield* makeZerospinError({
        code: 'session-claims-mismatch',
        message: 'Expected claims do not match admitted session claims',
      });
    }
    if (
      serviceSessionLock.actorName !== access.actorName ||
      serviceSessionLock.actorVersion !== access.actorVersion
    ) {
      return yield* Effect.fail(
        makeZerospinError({ code: 'service-actor-target-mismatch' }),
      );
    }
    const claims = admitted.claims;
    yield* requireDevelopmentSystemReady();
    const admittedLock = yield* authorizeServiceSession({
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceVersion: access.serviceVersion,
      serviceName: access.serviceName,
      sessionName,
      serviceSessionLock,
      claims,
    });
    return {
      serviceVersion: access.serviceVersion,
      sessionName,
      serviceSessionLock: admittedLock,
      serviceName: access.serviceName,
      systemId: env.ZEROSPIN_SYSTEM_ID,
      claims,
      actorPath: admitted.actorPath,
    };
  },
  {
    onSuccess: state => new ServiceSessionApi(state),
    onFailure: failure => new ServiceSessionApiFailure(failure),
  },
);
