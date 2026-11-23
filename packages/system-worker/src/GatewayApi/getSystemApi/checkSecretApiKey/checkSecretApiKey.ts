import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';

import type { IApiKeyPolicy } from '../../apiKeyPolicy.js';

/** Apply the deployment's development prefix or production secret-key policy. */
export const checkSecretApiKey = makeFn('GatewayApi.checkSecretApiKey')(
  function* (props: { apiKey: string; policy: IApiKeyPolicy }) {
    const { apiKey, policy } = props;
    if (policy.environment === 'dev') {
      if (apiKey.startsWith('sk_')) {
        return;
      }
      return yield* makeZerospinError({
        code: 'publishable-key-not-allowed',
        message: 'A secret API key is required',
      });
    }
    if (apiKey === policy.secretKey) {
      return;
    }
    if (apiKey === policy.publishableKey) {
      return yield* makeZerospinError({
        code: 'publishable-key-not-allowed',
        message: 'A secret API key is required',
      });
    }
    return yield* makeZerospinError({
      code: 'production-api-key-invalid',
      message: 'The API key does not match this production deployment',
      status: 401,
    });
  },
);
