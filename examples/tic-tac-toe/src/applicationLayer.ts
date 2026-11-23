import * as sdk from '@zerospin/sdk/browser';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';

export const applicationLayer = Layer.mergeAll(
  Layer.succeed(
    sdk.ZerospinApiUrl,
    import.meta.env.VITE_ZEROSPIN_API_URL ?? 'http://localhost:12003',
  ),
  Layer.succeed(
    sdk.PublishableKey,
    Redacted.make(import.meta.env.VITE_ZEROSPIN_PUBLISHABLE_KEY ?? ''),
  ),
);
