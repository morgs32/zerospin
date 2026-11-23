import * as sdk from '@zerospin/sdk/browser';

import { promotionReservation } from '../../../services/promotion/models/promotionReservation/promotionReservation';
import { PromotionDecisionSchema } from '../../../services/promotion/promotionDecision';
import { cart } from '../models/cart/cart';
import { purchase } from '../models/purchase/purchase';

export const commitExternalPromotionDefinitionV1 =
  sdk.defineAggregateExternalContract({
    name: 'commitExternalPromotion',
    version: 1,
    payload: {
      aggregateId: sdk.primitives.text(),
      cartId: sdk.modelId({ model: cart }),
      reservationId: sdk.modelId({ model: promotionReservation }),
      purchaseId: sdk.modelId({ model: purchase }),
    },
    response: PromotionDecisionSchema,
  });
