import * as sdk from '@zerospin/sdk/browser';

import { PurchaseQuoteResult, PurchaseSnapshot } from '../../../purchaseQuote';

export const getExternalPurchaseQuoteDefinitionV1 =
  sdk.defineAggregateExternalContract({
    name: 'getExternalPurchaseQuote',
    version: 1,
    payload: { snapshot: sdk.primitives.json({ schema: PurchaseSnapshot }) },
    response: PurchaseQuoteResult,
  });
