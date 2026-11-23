import * as sdk from '@zerospin/sdk/browser';
import { findFirst } from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { productV1 } from '../../../services/marketplace/models/product/ProductV1';
import { cart } from '../models/cart/cart';
import { cartV1 } from '../models/cart/CartV1';
import { cartItem } from '../models/cartItem/cartItem';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

export const addToCartV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('addToCart'),
  {
    version: 1,
    payload: {
      newCartId: sdk.modelId({ model: cart }),
      newCartItemId: sdk.modelId({ model: cartItem }),
      product: sdk.primitives.json({
        schema: Schema.Struct({
          id: productV1.table.codec.fields.id,
          name: productV1.table.codec.fields.name,
          price: productV1.table.codec.fields.price,
        }),
      }),
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
    operations: {
      createCart: cartV1.operations.create,
      createCartItem: cartItemV1.operations.create,
      updateCartItem: cartItemV1.operations.update,
    },
    failures: {
      locked: sdk.ContractError.schema({ code: 'cart-checkout-in-progress' }),
      invalidQuantity: sdk.ContractError.schema({
        code: 'cart-quantity-invalid',
      }),
    },
    result: Schema.Null,
    program: Effect.fn('addToCartV1.program')(function* ({
      payload: { newCartId, newCartItemId, product, quantity },
      db,
      failures,
      operations,
    }) {
      const cart = yield* findFirst({
        db,
        model: db.models.cart,
        with: { items: true, checkoutPurchase: true },
      });
      const state = cart?.checkoutPurchase?.paymentState;
      if (
        state === 'preparing' ||
        state === 'pending' ||
        state === 'needs_reconciliation'
      ) {
        return yield* failures.locked.make({
          message: 'The cart is locked until checkout settles.',
        });
      }
      const existing = cart?.items.find(item => item.productId === product.id);
      const resultingQuantity = (existing?.quantity ?? 0) + quantity;
      if (
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        !Number.isSafeInteger(resultingQuantity)
      ) {
        return yield* failures.invalidQuantity.make({
          message: 'Cart quantities must be positive supported integers.',
        });
      }
      if (!cart) {
        yield* operations.createCart({
          resourceId: newCartId,
          attributes: { checkoutPurchaseId: null, promotion: null },
        });
      }
      if (existing) {
        yield* operations.updateCartItem({
          resourceId: existing.id,
          attributes: { quantity: resultingQuantity },
        });
      } else {
        yield* operations.createCartItem({
          resourceId: newCartItemId,
          attributes: {
            cartId: cart?.id ?? newCartId,
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity,
          },
        });
      }
      return null;
    }),
  },
);
