import * as sdk from '@zerospin/sdk/browser';

import { PaymentEvidence } from '../../../ShoppingEvidence';
import { purchase } from '../models/purchase/purchase';

export const processExternalPaymentDefinitionV1 =
  sdk.defineAggregateExternalContract({
    name: 'processExternalPayment',
    version: 1,
    payload: {
      purchaseId: sdk.modelId({ model: purchase }),
      key: sdk.primitives.text(),
      total: sdk.primitives.integer(),
    },
    response: PaymentEvidence,
  });
