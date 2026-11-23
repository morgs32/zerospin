import * as sdk from '@zerospin/sdk/browser';
import { findFirst } from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { cartV1 } from '../models/cart/CartV1';
import { cartItem } from '../models/cartItem/cartItem';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

export const updateCartItemQuantityV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('updateCartItemQuantity'),
  {
    version: 1,
    payload: {
      cartItemId: sdk.modelId({ model: cartItem }),
      quantity: sdk.primitives.integer(),
    },
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
    operations: { updateCartItem: cartItemV1.operations.update },
    failures: {
      unavailable: sdk.ContractError.schema({ code: 'cart-item-unavailable' }),
      locked: sdk.ContractError.schema({ code: 'cart-checkout-in-progress' }),
      invalidQuantity: sdk.ContractError.schema({
        code: 'cart-quantity-invalid',
      }),
    },
    program: Effect.fn('updateCartItemQuantityV1.program')(function* ({
      payload,
      db,
      failures,
      operations,
    }) {
      const item = yield* findFirst({
        db,
        model: db.models.cartItem,
        where: { id: { eq: payload.cartItemId } },
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
      if (!Number.isSafeInteger(payload.quantity) || payload.quantity <= 0) {
        return yield* failures.invalidQuantity.make({
          message: 'Cart quantities must be positive supported integers.',
        });
      }
      yield* operations.updateCartItem({
        resourceId: item.id,
        attributes: { quantity: payload.quantity },
      });
    }),
  },
);
