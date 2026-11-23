import * as sdk from '@zerospin/sdk/browser';
import { findFirst } from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { cartV1 } from '../models/cart/CartV1';
import { cartItem } from '../models/cartItem/cartItem';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

export const removeFromCartV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('removeFromCart'),
  {
    version: 1,
    payload: { id: sdk.modelId({ model: cartItem }) },
    models: {
      cart: {
        model: cartV1,
        fields: ['createdAt', 'updatedAt', 'promotion', 'checkoutPurchaseId'],
      },
      cartItem: {
        model: cartItemV1,
        fields: [
          'name',
          'createdAt',
          'updatedAt',
          'cartId',
          'productId',
          'price',
          'quantity',
        ],
      },
      purchase: {
        model: purchaseV1,
        fields: [
          'createdAt',
          'updatedAt',
          'cartId',
          'reservationId',
          'subtotal',
          'discount',
          'total',
          'paymentState',
          'paymentReference',
          'paymentEvidence',
          'labelState',
          'labelReference',
          'trackingNumber',
          'trackingStatus',
          'trackingRefreshSequence',
          'trackingRefreshPending',
        ],
      },
    },
    operations: { deleteCartItem: cartItemV1.operations.delete },
    failures: {
      unavailable: sdk.ContractError.schema({ code: 'cart-item-unavailable' }),
      locked: sdk.ContractError.schema({ code: 'cart-checkout-in-progress' }),
    },
    program: Effect.fn('removeFromCartV1.program')(function* ({
      payload,
      db,
      failures,
      operations,
    }) {
      const item = yield* findFirst({
        db,
        model: db.models.cartItem,
        where: { id: { eq: payload.id } },
        with: { cart: { with: { checkoutPurchase: true } } },
      });
      if (!item) {
        return yield* failures.unavailable.make({
          message: 'Cart item not found.',
        });
      }
      const state = item.cart.checkoutPurchase?.paymentState;
      if (
        state === 'preparing' ||
        state === 'pending' ||
        state === 'needs_reconciliation'
      ) {
        return yield* failures.locked.make({
          message: 'The cart is locked until checkout settles.',
        });
      }
      yield* operations.deleteCartItem({ resourceId: item.id });
    }),
  },
);
