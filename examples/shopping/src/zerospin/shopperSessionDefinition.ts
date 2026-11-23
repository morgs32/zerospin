import { makeAggregateSessionDefinition } from '@zerospin/browser';

import { addToCartV1 } from './aggregates/user/contracts/addToCartV1';
import { applyPromotionV1 } from './aggregates/user/contracts/applyPromotionV1';
import { checkoutV1 } from './aggregates/user/contracts/checkoutV1';
import { removeFromCartV1 } from './aggregates/user/contracts/removeFromCartV1';
import { removePromotionV1 } from './aggregates/user/contracts/removePromotionV1';
import { updateCartItemQuantityV1 } from './aggregates/user/contracts/updateCartItemQuantityV1';
import { cartV1 } from './aggregates/user/models/cart/CartV1';
import { cartItemV1 } from './aggregates/user/models/cartItem/CartItemV1';
import { purchaseV1 } from './aggregates/user/models/purchase/PurchaseV1';
import { purchaseItemV1 } from './aggregates/user/models/purchaseItem/PurchaseItemV1';
import { userAggregateClaims } from './claims';
import { latestUserRelease } from './userReleaseSelection';

export const shopperSessionDefinition = makeAggregateSessionDefinition({
  claimsSchema: userAggregateClaims,
  actorName: 'user',
  actorVersion: 1,
  aggregateName: 'user',
  aggregateVersion: latestUserRelease,
  sessionName: 'shopperSession',
  models: {
    cart: cartV1,
    cartItem: cartItemV1,
    purchase: purchaseV1,
    purchaseItem: purchaseItemV1,
  },
  contracts: {
    addToCart: addToCartV1,
    applyPromotion: applyPromotionV1,
    removePromotion: removePromotionV1,
    removeFromCart: removeFromCartV1,
    updateCartItemQuantity: updateCartItemQuantityV1,
    checkout: checkoutV1,
  },
  systemName: 'shopping',
});
