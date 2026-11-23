import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { rpcMethod } from '../../makeRpcApi/makeRpcApi.js';
import { ServiceApi } from '../../ServiceApi/ServiceApi.js';
import { ServiceApiFailure } from '../../ServiceApi/ServiceApiFailure/ServiceApiFailure.js';
import { checkPublishableApiKey } from '../checkPublishableApiKey/checkPublishableApiKey.js';

/** Validate input before admission; construct the capability after optional telemetry delivery. */
export const service = rpcMethod({
  name: 'GatewayApi.service',
  schema: Schema.Struct({
    publishableKey: Schema.String,
    systemName: Schema.String,
    name: Schema.String,
    version: VersionSchema,
  }),
  parseError: {
    code: 'service-api-arguments-invalid',
    prefix: 'Invalid service capability arguments',
  },
})(
  function* (request) {
    const { publishableKey, systemName, name, version } = request;
    const policy = {
      environment: env.ZEROSPIN_ENVIRONMENT,
      secretKey: env.ZEROSPIN_SECRET_KEY,
      publishableKey: env.ZEROSPIN_PUBLISHABLE_KEY,
    };
    yield* checkPublishableApiKey({
      apiKey: publishableKey,
      policy,
    });
    const system = yield* getSystemSpec();
    if (systemName !== system.systemName) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'identity-system-name-mismatch',
          message: 'Requested system differs from the configured system',
        }),
      );
    }
    if (
      !Object.hasOwn(system.services, name) ||
      system.services[name]?.releases[version] === undefined
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'identity-service-unavailable',
          message: 'The requested service version is unavailable',
        }),
      );
    }
    return {
      systemName,
      serviceName: name,
      serviceVersion: version,
    };
  },
  {
    onSuccess: state => new ServiceApi(state),
    onFailure: failure => new ServiceApiFailure(failure),
  },
);
