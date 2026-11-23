import { RoutePattern } from '@remix-run/route-pattern';
import * as sdk from '@zerospin/sdk';
import * as Effect from 'effect/Effect';

import { clerkCredentialsSchema, userAggregateClaims } from '../../../claims';
import { verifyClerkIdentity } from '../../../verifyClerkIdentity';
import { addToCartV1 } from '../contracts/addToCartV1';
import { applyPromotionV1 } from '../contracts/applyPromotionV1';
import { checkoutV1 } from '../contracts/checkoutV1';
import { removeFromCartV1 } from '../contracts/removeFromCartV1';
import { removePromotionV1 } from '../contracts/removePromotionV1';
import { updateCartItemQuantityV1 } from '../contracts/updateCartItemQuantityV1';
import { cartV1 } from '../models/cart/CartV1';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { purchaseV1 } from '../models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../models/purchaseItem/PurchaseItemV1';

const db = sdk.makeQueryDbVersion({
  models: {
    cart: cartV1,
    cartItem: cartItemV1,
    purchase: purchaseV1,
    purchaseItem: purchaseItemV1,
  },
});
export const userActorV1 = sdk.makeAggregateActorRelease(
  sdk.defineAggregateActor({ name: 'user' }),
  {
    version: 1,
    db,
    exposedModels: {
      cart: cartV1,
      cartItem: cartItemV1,
      purchase: purchaseV1,
      purchaseItem: purchaseItemV1,
    },
    identity: sdk.makeActorIdentity({
      claims: userAggregateClaims,
      actorPath: RoutePattern.parse('/:clerkUserId'),
    }),
    authentication: {
      credentialsSchema: clerkCredentialsSchema,
      authenticate: ({ credentials }) =>
        verifyClerkIdentity(credentials).pipe(
          Effect.map(clerkUserId => ({
            clerkUserId,
            aggregateId: clerkUserId,
          })),
        ),
    },
    authorize: ({ claims, aggregateId }) =>
      claims.aggregateId === claims.clerkUserId &&
      aggregateId === claims.aggregateId
        ? Effect.void
        : Effect.fail(
            sdk.makeZerospinError({
              code: 'user-aggregate-identity-mismatch',
              message:
                'The user aggregate must belong to the verified Clerk subject.',
            }),
          ),
    contracts: {
      addToCart: addToCartV1,
      applyPromotion: applyPromotionV1,
      removePromotion: removePromotionV1,
      removeFromCart: removeFromCartV1,
      updateCartItemQuantity: updateCartItemQuantityV1,
      checkout: checkoutV1,
    },
    selections: {
      cart: db.query.cart.findMany({}),
      cartItem: db.query.cartItem.findMany({}),
      purchase: db.query.purchase.findMany({}),
      purchaseItem: db.query.purchaseItem.findMany({}),
    },
  },
);
