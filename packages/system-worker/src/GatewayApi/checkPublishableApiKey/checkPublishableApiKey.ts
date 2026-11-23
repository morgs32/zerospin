import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';

import type { IApiKeyPolicy } from '../apiKeyPolicy.js';

/** Apply the deployment's development prefix or production publishable-key policy. */
export const checkPublishableApiKey = makeFn(
  'GatewayApi.checkPublishableApiKey',
)(function* (props: { apiKey: string; policy: IApiKeyPolicy }) {
  const { apiKey, policy } = props;
  if (policy.environment === 'dev') {
    if (!apiKey.startsWith('sk_')) {
      return;
    }
    return yield* makeZerospinError({
      code: 'secret-key-not-allowed',
      message: 'A publishable API key is required',
    });
  }
  if (apiKey === policy.secretKey) {
    return yield* makeZerospinError({
      code: 'secret-key-not-allowed',
      message: 'A publishable API key is required',
    });
  }
  if (apiKey === policy.publishableKey) {
    return;
  }
  return yield* makeZerospinError({
    code: 'production-api-key-invalid',
    message: 'The API key does not match this production deployment',
    status: 401,
  });
});
