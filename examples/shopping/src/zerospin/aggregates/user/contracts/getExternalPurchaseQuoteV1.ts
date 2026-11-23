/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';
import * as Schema from 'effect/Schema';

import { PurchaseQuoteResult } from '../../../purchaseQuote';
import { productV1 } from '../../../services/marketplace/models/product/ProductV1';
import { ShoppingSystemApi } from '../../../ShoppingSystemApi';

import { applyPurchaseQuoteV1 } from './applyPurchaseQuoteV1';
import { getExternalPurchaseQuoteDefinitionV1 } from './getExternalPurchaseQuoteDefinitionV1';
import { quotePurchase } from './utils/quotePurchase';

const marketplaceDb = sdk.makeQueryDbVersion({
  models: { product: productV1 },
});

export const getExternalPurchaseQuoteV1 =
  sdk.makeAggregateExternalContractRelease(
    getExternalPurchaseQuoteDefinitionV1,
    {
      request: ({ payload: { snapshot } }) =>
        Effect.gen(function* () {
          const acquireApi = yield* ShoppingSystemApi;
          const api = yield* acquireApi;
          const products = yield* api
            .executeServiceQuery({
              serviceName: 'marketplace',
              serviceVersion: 1,
              query: marketplaceDb.query.product.findMany({
                where: {
                  id: {
                    in: [
                      ...new Set(snapshot.items.map(item => item.productId)),
                    ],
                  },
                },
              }),
            })
            .pipe(
              Effect.retry({
                times: 2,
                schedule: Schedule.spaced('250 millis'),
                while: failure =>
                  failure.code === 'rpc-selection-failed' ||
                  failure.code === 'rpc-invocation-failed' ||
                  failure.code === 'rpc-invalid-response',
              }),
              Effect.mapError(failure =>
                sdk.isZerospinError(failure)
                  ? failure
                  : sdk.makeZerospinError({
                      code: failure.code,
                      message: failure.message,
                      status: failure.status,
                      extra: failure.extra,
                    }),
              ),
            );
          return yield* Schema.decodeUnknownEffect(PurchaseQuoteResult)(
            quotePurchase({ snapshot, products }),
          ).pipe(
            Effect.mapError(cause =>
              sdk.makeZerospinError({
                code: 'shopping-purchase-quote-invalid',
                message: 'The catalog returned an invalid purchase quote.',
                cause: sdk.prettyUnknownFailure(cause),
              }),
            ),
          );
        }),
      onSuccess: {
        contract: applyPurchaseQuoteV1,
        payload: Effect.fn('getExternalPurchaseQuoteV1.onSuccess')(function* ({
          payload,
          response,
        }) {
          return {
            snapshot: payload.snapshot,
            quote: response.state === 'quoted' ? response.quote : null,
          };
        }),
      },
      onFailure: {
        contract: applyPurchaseQuoteV1,
        payload: Effect.fn('getExternalPurchaseQuoteV1.onFailure')(function* ({
          payload,
        }) {
          return { snapshot: payload.snapshot, quote: null };
        }),
      },
    },
  );
