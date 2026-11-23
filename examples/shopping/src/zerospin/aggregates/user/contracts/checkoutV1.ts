import * as sdk from '@zerospin/sdk/browser';
import { findFirst } from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { PurchaseSnapshot } from '../../../purchaseQuote';
import { promotionReservation } from '../../../services/promotion/models/promotionReservation/promotionReservation';
import { cart } from '../models/cart/cart';
import { cartV1 } from '../models/cart/CartV1';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { purchase } from '../models/purchase/purchase';
import { purchaseV1 } from '../models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../models/purchaseItem/PurchaseItemV1';

import { getExternalPurchaseQuoteDefinitionV1 } from './getExternalPurchaseQuoteDefinitionV1';

export const checkoutV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('checkout'),
  {
    version: 1,
    payload: {
      cartId: sdk.modelId({ model: cart }),
      purchaseId: sdk.modelId({ model: purchase }),
      reservationId: sdk.modelId({
        model: promotionReservation,
        nullable: true,
      }),
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
      purchaseItem: {
        model: purchaseItemV1,
        fields: [
          'name',
          'createdAt',
          'updatedAt',
          'productId',
          'price',
          'quantity',
          'purchaseId',
        ],
      },
    },
    operations: {
      createPurchase: purchaseV1.operations.create,
      createPurchaseItem: purchaseItemV1.operations.create,
      updateCart: cartV1.operations.update,
      quotePurchase: getExternalPurchaseQuoteDefinitionV1.externalOperation,
    },
    result: PurchaseSnapshot,
    failures: {
      unavailable: sdk.ContractError.schema({
        code: 'checkout-cart-unavailable',
      }),
      invalidCart: sdk.ContractError.schema({ code: 'checkout-cart-invalid' }),
      locked: sdk.ContractError.schema({ code: 'cart-checkout-in-progress' }),
      selectionChanged: sdk.ContractError.schema({
        code: 'checkout-promotion-selection-changed',
      }),
      reservationClaimed: sdk.ContractError.schema({
        code: 'promotion-reservation-claimed',
      }),
    },
    program: Effect.fn('checkoutV1.program')(function* ({
      payload,
      db,
      failures,
      operations,
    }) {
      const cart = yield* findFirst({
        db,
        model: db.models.cart,
        where: { id: { eq: payload.cartId } },
        with: { items: true, checkoutPurchase: true },
      });
      if (!cart) {
        return yield* failures.unavailable.make({
          message: 'Checkout requires your cart.',
        });
      }
      const state = cart.checkoutPurchase?.paymentState;
      if (
        state === 'preparing' ||
        state === 'pending' ||
        state === 'needs_reconciliation'
      ) {
        return yield* failures.locked.make({
          message: 'The cart is locked until checkout settles.',
        });
      }
      const selectedReservationId =
        cart.promotion?.action === 'apply'
          ? cart.promotion.reservationId
          : null;
      if (payload.reservationId !== selectedReservationId) {
        return yield* failures.selectionChanged.make({
          message:
            'The cart promotion changed. Check the selection before checkout.',
        });
      }
      if (payload.reservationId !== null) {
        const purchases = yield* sdk.findMany({
          db,
          model: db.models.purchase,
          where: { reservationId: { eq: payload.reservationId } },
        });
        if (
          purchases.some(
            purchase =>
              purchase.reservationId !== null && purchase.subtotal !== null,
          )
        ) {
          return yield* failures.reservationClaimed.make({
            message:
              'Apply a fresh reservation or explicitly remove the promotion before checkout.',
          });
        }
      }
      if (
        cart.items.length === 0 ||
        cart.items.some(
          item => !Number.isSafeInteger(item.quantity) || item.quantity <= 0,
        ) ||
        (yield* findFirst({
          db,
          model: db.models.purchase,
          where: { id: { eq: payload.purchaseId } },
        }))
      ) {
        return yield* failures.invalidCart.make({
          message:
            'Checkout requires positive quantities and a fresh purchase identity.',
        });
      }
      const snapshot = {
        cartId: payload.cartId,
        purchaseId: payload.purchaseId,
        items: cart.items.map(item => ({
          id: `pit_${payload.purchaseId.slice(4)}_${item.id.slice(4)}` as const,
          productId: item.productId,
          quantity: item.quantity,
        })),
      };
      yield* operations.createPurchase({
        resourceId: payload.purchaseId,
        attributes: {
          cartId: cart.id,
          reservationId: payload.reservationId,
          subtotal: null,
          discount: null,
          total: null,
          paymentState: 'preparing',
          paymentReference: null,
          paymentEvidence: null,
          labelState: 'none',
          labelReference: null,
          trackingNumber: null,
          trackingStatus: null,
          trackingRefreshSequence: 0,
          trackingRefreshPending: false,
        },
      });
      for (const item of snapshot.items) {
        yield* operations.createPurchaseItem({
          resourceId: item.id,
          attributes: {
            purchaseId: payload.purchaseId,
            productId: item.productId,
            name: null,
            price: null,
            quantity: item.quantity,
          },
        });
      }
      yield* operations.updateCart({
        resourceId: cart.id,
        attributes: { checkoutPurchaseId: payload.purchaseId },
      });
      yield* operations.quotePurchase({ payload: { snapshot } });
      return snapshot;
    }),
  },
);
