import { env } from 'cloudflare:workers';
import * as Schema from 'effect/Schema';

import { rpcMethod } from '../../makeRpcApi/makeRpcApi.js';
import { SystemApi } from '../../SystemApi/SystemApi.js';
import { SystemApiFailure } from '../../SystemApi/SystemApiFailure/SystemApiFailure.js';

import { checkSecretApiKey } from './checkSecretApiKey/checkSecretApiKey.js';

/** Authenticate secret-key access before returning the System capability. */
export const getSystemApi = rpcMethod({
  name: 'GatewayApi.getSystemApi',
  schema: Schema.toType(Schema.Struct({ zerospinSecretKey: Schema.String })),
  parseError: {
    code: 'failed-to-decode-get-system-api-props',
    prefix: 'Failed to decode getSystemApi props',
  },
})(
  function* (validated) {
    const { zerospinSecretKey } = validated;
    const policy = {
      environment: env.ZEROSPIN_ENVIRONMENT,
      secretKey: env.ZEROSPIN_SECRET_KEY,
      publishableKey: env.ZEROSPIN_PUBLISHABLE_KEY,
    };
    yield* checkSecretApiKey({
      apiKey: zerospinSecretKey,
      policy,
    });
    return env.ZEROSPIN_SYSTEM_ID;
  },
  {
    onSuccess: systemId => new SystemApi(systemId),
    onFailure: failure => new SystemApiFailure(failure),
  },
);
