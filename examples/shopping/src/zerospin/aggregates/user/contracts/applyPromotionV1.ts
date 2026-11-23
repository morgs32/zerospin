import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { promotionReservation } from '../../../services/promotion/models/promotionReservation/promotionReservation';
import { promotionService } from '../../../services/promotion/promotionService';
import { reservePromotion } from '../../../services/promotion/ReservePromotionV1';
import { cart } from '../models/cart/cart';
import { cartV1 } from '../models/cart/CartV1';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

export const applyPromotionV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('applyPromotion'),
  {
    version: 1,
    payload: {
      cartId: sdk.modelId({ model: cart }),
      reservationId: sdk.modelId({ model: promotionReservation }),
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
      updateCart: cartV1.operations.update,
      reservePromotion: sdk.makeCommandOperation({
        destination: { service: promotionService, version: 1 },
        contract: reservePromotion,
      }),
    },
    failures: {
      unavailable: sdk.ContractError.schema({
        code: 'promotion-cart-unavailable',
      }),
      locked: sdk.ContractError.schema({ code: 'cart-checkout-in-progress' }),
      claimed: sdk.ContractError.schema({
        code: 'promotion-reservation-claimed',
      }),
    },
    result: Schema.Null,
    program: Effect.fn('applyPromotionV1.program')(function* ({
      payload,
      aggregateId,
      db,
      failures,
      operations,
    }) {
      const cart = yield* sdk.findFirst({
        db,
        model: db.models.cart,
        where: { id: { eq: payload.cartId } },
        with: { items: true, checkoutPurchase: true },
      });
      if (!cart || cart.items.length === 0) {
        return yield* failures.unavailable.make({
          message: 'Apply a promotion to a nonempty cart.',
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
        return yield* failures.claimed.make({
          message:
            'Apply a fresh reservation after a purchase has claimed this one.',
        });
      }
      yield* operations.updateCart({
        resourceId: cart.id,
        attributes: {
          promotion: {
            reservationId: payload.reservationId,
            action: 'apply',
          },
        },
      });
      yield* operations.reservePromotion({
        payload: {
          id: payload.reservationId,
          cartId: payload.cartId,
          aggregateId,
        },
      });
      return null;
    }),
  },
);
