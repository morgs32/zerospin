import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { promotionReservation } from '../../../services/promotion/models/promotionReservation/promotionReservation';
import { promotionService } from '../../../services/promotion/promotionService';
import { releasePromotion } from '../../../services/promotion/ReleasePromotionV1';
import { cart } from '../models/cart/cart';
import { cartV1 } from '../models/cart/CartV1';
import { purchase } from '../models/purchase/purchase';
import { purchaseV1 } from '../models/purchase/PurchaseV1';

import { processExternalPaymentDefinitionV1 } from './processExternalPaymentDefinitionV1';

export const applyPromotionCommitmentV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('applyPromotionCommitment'),
  {
    version: 1,
    payload: {
      aggregateId: sdk.primitives.text(),
      cartId: sdk.modelId({ model: cart }),
      reservationId: sdk.modelId({ model: promotionReservation }),
      purchaseId: sdk.modelId({ model: purchase }),
      committed: sdk.primitives.boolean(),
    },
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
      updatePurchase: purchaseV1.operations.update,
      processPayment: processExternalPaymentDefinitionV1.externalOperation,
      releasePromotion: sdk.makeCommandOperation({
        destination: { service: promotionService, version: 1 },
        contract: releasePromotion,
      }),
    },
    program: Effect.fn('applyPromotionCommitmentV1.program')(function* ({
      payload,
      aggregateId,
      db,
      operations,
    }) {
      const purchase = yield* sdk.findFirst({
        db,
        model: db.models.purchase,
        where: { id: { eq: payload.purchaseId } },
      });
      const cart = yield* sdk.findFirst({
        db,
        model: db.models.cart,
        where: { id: { eq: payload.cartId } },
      });
      if (
        aggregateId !== payload.aggregateId ||
        !purchase ||
        purchase.cartId !== payload.cartId ||
        purchase.reservationId !== payload.reservationId ||
        purchase.paymentState !== 'preparing' ||
        purchase.reservationId === null ||
        purchase.subtotal === null
      ) {
        return;
      }
      const selected =
        cart?.checkoutPurchaseId === purchase.id &&
        cart.promotion?.action === 'apply' &&
        cart.promotion.reservationId === purchase.reservationId;
      const subtotal = purchase.subtotal;
      if (
        !payload.committed ||
        !selected ||
        subtotal === null ||
        !Number.isSafeInteger(subtotal) ||
        subtotal < 0
      ) {
        // This Purchase is terminal before cancellation is emitted. A late commitment cannot start payment.
        yield* operations.updatePurchase({
          resourceId: purchase.id,
          attributes: {
            paymentState: 'refused',
          },
        });
        yield* operations.releasePromotion({
          payload: {
            id: payload.reservationId,
            aggregateId: payload.aggregateId,
            cartId: payload.cartId,
            purchaseId: payload.purchaseId,
          },
        });
        return;
      }
      const discount = Math.floor(subtotal / 2);
      const total = subtotal - discount;
      yield* operations.updatePurchase({
        resourceId: purchase.id,
        attributes: {
          discount,
          total,
          paymentState: 'pending',
        },
      });
      yield* operations.processPayment({
        payload: {
          purchaseId: purchase.id,
          total,
          key: `shopping:${aggregateId}:${purchase.id}:payment`,
        },
      });
    }),
  },
);
