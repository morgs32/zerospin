import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { AggregateApi } from '../../AggregateApi/AggregateApi.js';
import { AggregateApiFailure } from '../../AggregateApi/AggregateApiFailure/AggregateApiFailure.js';
import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { rpcMethod } from '../../makeRpcApi/makeRpcApi.js';
import { checkPublishableApiKey } from '../checkPublishableApiKey/checkPublishableApiKey.js';

/** Validate input before admission; construct the capability after optional telemetry delivery. */
export const aggregate = rpcMethod({
  name: 'GatewayApi.aggregate',
  schema: Schema.Struct({
    publishableKey: Schema.String,
    systemName: Schema.String,
    name: Schema.String,
    version: VersionSchema,
    actorName: Schema.String,
    actorVersion: VersionSchema,
  }),
  parseError: {
    code: 'aggregate-api-arguments-invalid',
    prefix: 'Invalid aggregate capability arguments',
  },
})(
  function* (request) {
    const {
      publishableKey,
      systemName,
      name,
      version,
      actorName,
      actorVersion,
    } = request;
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
      !Object.hasOwn(system.aggregates, name) ||
      system.aggregates[name]?.releases[version] === undefined
    ) {
      return yield* Effect.fail(
        makeZerospinError('identity-aggregate-unavailable'),
      );
    }
    return {
      systemName,
      aggregateName: name,
      aggregateVersion: version,
      actorName,
      actorVersion,
    };
  },
  {
    onSuccess: state => new AggregateApi(state),
    onFailure: failure => new AggregateApiFailure(failure),
  },
);
