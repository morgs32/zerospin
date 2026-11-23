import { SecretKey } from '@zerospin/core/services/SecretKey';
import { getSystemApi } from '@zerospin/core/utils/getSystemApi/getSystemApi';
import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';

import { ShoppingSystemApi } from './ShoppingSystemApi';

export const ShoppingSystemApiLive = Layer.succeed(
  ShoppingSystemApi,
  Effect.gen(function* () {
    const { env } = yield* Effect.promise(() => import('cloudflare:workers'));
    const {
      SHOPPING_ZEROSPIN_API_URL: apiUrl,
      ZEROSPIN_SECRET_KEY: zerospinSecretKey,
    } = env;
    if (!apiUrl || !zerospinSecretKey) {
      return yield* sdk.makeZerospinError({
        code: 'shopping-system-api-not-configured',
        message:
          'Set SHOPPING_ZEROSPIN_API_URL and ZEROSPIN_SECRET_KEY on the Shopping backend worker.',
      });
    }
    const endpoint = yield* Effect.try({
      try: () => new URL(apiUrl),
      catch: () =>
        sdk.makeZerospinError({
          code: 'shopping-system-api-url-invalid',
          message: 'SHOPPING_ZEROSPIN_API_URL must be an HTTP or HTTPS URL.',
        }),
    });
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      return yield* sdk.makeZerospinError({
        code: 'shopping-system-api-url-invalid',
        message: 'SHOPPING_ZEROSPIN_API_URL must be an HTTP or HTTPS URL.',
      });
    }
    return yield* getSystemApi().pipe(
      Effect.provideService(sdk.ZerospinApiUrl, apiUrl),
      Effect.provideService(SecretKey, Redacted.make(zerospinSecretKey)),
    );
  }),
);
