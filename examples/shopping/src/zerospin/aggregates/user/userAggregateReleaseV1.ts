import * as sdk from '@zerospin/sdk';

import { userActorV1 } from './actors/userActorV1';
import { addReleaseCartItemV1 } from './contracts/addReleaseCartItemV1';
import { addToCartV1 } from './contracts/addToCartV1';
import { applyPaymentObservationV1 } from './contracts/applyPaymentObservationV1';
import { applyPromotionCommitmentV1 } from './contracts/applyPromotionCommitmentV1';
import { applyPurchaseQuoteV1 } from './contracts/applyPurchaseQuoteV1';
import { applyTrackingLabelV1 } from './contracts/applyTrackingLabelV1';
import { applyTrackingRefreshV1 } from './contracts/applyTrackingRefreshV1';
import { commitExternalPromotionV1 } from './contracts/commitExternalPromotionV1';
import { createExternalTrackingLabelV1 } from './contracts/createExternalTrackingLabelV1';
import { createTrackingLabelV1 } from './contracts/createTrackingLabelV1';
import { getExternalPurchaseQuoteV1 } from './contracts/getExternalPurchaseQuoteV1';
import { markPaymentForReconciliationV1 } from './contracts/markPaymentForReconciliationV1';
import { processExternalPaymentV1 } from './contracts/processExternalPaymentV1';
import { refreshExternalTrackingInfoV1 } from './contracts/refreshExternalTrackingInfoV1';
import { updateTrackingInfoV1 } from './contracts/updateTrackingInfoV1';
import { cartV1 } from './models/cart/CartV1';
import { cartItemV1 } from './models/cartItem/CartItemV1';
import { purchaseV1 } from './models/purchase/PurchaseV1';
import { purchaseItemV1 } from './models/purchaseItem/PurchaseItemV1';
import { userAggregate } from './userAggregate';
import { userLayer } from './userLayer';

export const userAggregateReleaseV1 = sdk.makeAggregateRelease(userAggregate, {
  version: 1,
  layer: userLayer,
  system: {
    addToCart: addToCartV1,
    addReleaseCartItem: addReleaseCartItemV1,
  },
  contracts: {
    createTrackingLabel: createTrackingLabelV1,
    updateTrackingInfo: updateTrackingInfoV1,
    applyPaymentObservation: applyPaymentObservationV1,
    applyPromotionCommitment: applyPromotionCommitmentV1,
    applyPurchaseQuote: applyPurchaseQuoteV1,
    applyTrackingLabel: applyTrackingLabelV1,
    applyTrackingRefresh: applyTrackingRefreshV1,
    markPaymentForReconciliation: markPaymentForReconciliationV1,
  },
  models: {
    cart: cartV1,
    cartItem: cartItemV1,
    purchase: purchaseV1,
    purchaseItem: purchaseItemV1,
  },
  external: {
    commitExternalPromotion: commitExternalPromotionV1,
    getExternalPurchaseQuote: getExternalPurchaseQuoteV1,
    processExternalPayment: processExternalPaymentV1,
    createExternalTrackingLabel: createExternalTrackingLabelV1,
    refreshExternalTrackingInfo: refreshExternalTrackingInfoV1,
  },
  actors: { user: userActorV1 },
});
