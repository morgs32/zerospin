import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { promotionService } from '../../../services/promotion/promotionService';
import { releasePromotion } from '../../../services/promotion/ReleasePromotionV1';
import { cart } from '../models/cart/cart';
import { cartV1 } from '../models/cart/CartV1';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

export const PromotionCancellation = Schema.Struct({
  reservationId: Schema.TemplateLiteral(['prv_', Schema.String]),
  purchaseId: Schema.NullOr(Schema.TemplateLiteral(['pur_', Schema.String])),
});

export const removePromotionV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('removePromotion'),
  {
    version: 1,
    payload: { cartId: sdk.modelId({ model: cart }) },
    models: {
      cart: {
        model: cartV1,
        fields: ['createdAt', 'updatedAt', 'promotion', 'checkoutPurchaseId'],
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
      releasePromotion: sdk.makeCommandOperation({
        destination: { service: promotionService, version: 1 },
        contract: releasePromotion,
      }),
    },
    failures: {
      unavailable: sdk.ContractError.schema({
        code: 'promotion-selection-unavailable',
      }),
      locked: sdk.ContractError.schema({ code: 'promotion-payment-unsettled' }),
    },
    result: PromotionCancellation,
    program: Effect.fn('removePromotionV1.program')(function* ({
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
        with: { checkoutPurchase: true },
      });
      if (!cart?.promotion) {
        return yield* failures.unavailable.make({
          message: 'The cart has no promotion to remove.',
        });
      }
      const state = cart.checkoutPurchase?.paymentState;
      const purchases = yield* sdk.findMany({
        db,
        model: db.models.purchase,
        where: { reservationId: { eq: cart.promotion.reservationId } },
      });
      const claimed = purchases.filter(
        purchase =>
          purchase.reservationId !== null && purchase.subtotal !== null,
      );
      const purchase = claimed[0];
      if (
        state === 'preparing' ||
        state === 'pending' ||
        state === 'needs_reconciliation' ||
        claimed.length > 1 ||
        (purchase &&
          (purchase.cartId !== cart.id ||
            (purchase.paymentState !== 'refused' &&
              purchase.paymentState !== 'declined')))
      ) {
        return yield* failures.locked.make({
          message:
            'A promotion cannot be released during uncertain payment or after payment.',
        });
      }
      yield* operations.updateCart({
        resourceId: cart.id,
        attributes: {
          promotion: {
            ...cart.promotion,
            action: 'remove',
          },
        },
      });
      yield* operations.releasePromotion({
        payload: {
          id: cart.promotion.reservationId,
          aggregateId,
          cartId: payload.cartId,
          purchaseId: purchase?.id ?? null,
        },
      });
      return {
        reservationId: cart.promotion.reservationId,
        purchaseId: purchase?.id ?? null,
      };
    }),
  },
);
