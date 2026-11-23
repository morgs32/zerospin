import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { promotionService } from '../../../services/promotion/promotionService';
import { redeemPromotion } from '../../../services/promotion/RedeemPromotionV1';
import { releasePromotion } from '../../../services/promotion/ReleasePromotionV1';
import { cartV1 } from '../models/cart/CartV1';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { purchase } from '../models/purchase/purchase';
import { purchaseV1 } from '../models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../models/purchaseItem/PurchaseItemV1';

import { matchesPaymentCheckout } from './utils/matchesPaymentCheckout';

export const applyPaymentObservationV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('applyPaymentObservation'),
  {
    version: 1,
    payload: {
      purchaseId: sdk.modelId({ model: purchase }),
      key: sdk.primitives.text(),
      total: sdk.primitives.integer(),
      providerKey: sdk.primitives.text(),
      providerTotal: sdk.primitives.integer(),
      state: sdk.primitives.enum({ values: ['paid', 'declined'] }),
      reference: sdk.primitives.text(),
      evidence: sdk.primitives.text(),
    },
    models: {
      cart: {
        model: cartV1,
        fields: ['promotion', 'checkoutPurchaseId'],
      },
      cartItem: {
        model: cartItemV1,
        fields: ['cartId', 'productId', 'quantity'],
      },
      purchase: {
        model: purchaseV1,
        fields: ['cartId', 'reservationId', 'total', 'paymentState'],
      },
      purchaseItem: {
        model: purchaseItemV1,
        fields: ['productId', 'quantity', 'purchaseId'],
      },
    },
    failures: {
      staleObservation: sdk.ContractError.schema({
        code: 'stale-provider-observation',
      }),
    },
    operations: {
      updatePurchase: purchaseV1.operations.update,
      deleteCartItem: cartItemV1.operations.delete,
      updateCart: cartV1.operations.update,
      redeemPromotion: sdk.makeCommandOperation({
        destination: { service: promotionService, version: 1 },
        contract: redeemPromotion,
      }),
      releasePromotion: sdk.makeCommandOperation({
        destination: { service: promotionService, version: 1 },
        contract: releasePromotion,
      }),
    },
    program: Effect.fn('applyPaymentObservationV1.program')(function* ({
      payload,
      aggregateId,
      db,
      failures,
      operations,
    }) {
      const purchase = yield* sdk.findFirst({
        db,
        model: db.models.purchase,
        where: { id: { eq: payload.purchaseId } },
        with: { items: true },
      });
      const cart = yield* sdk.findFirst({
        db,
        model: db.models.cart,
        where: { checkoutPurchaseId: { eq: payload.purchaseId } },
        with: { items: true },
      });
      if (
        !purchase ||
        !cart ||
        !matchesPaymentCheckout({ aggregateId, payload, purchase, cart }) ||
        payload.providerKey !== payload.key ||
        payload.providerTotal !== payload.total
      ) {
        return yield* failures.staleObservation.make({
          message:
            'Payment evidence no longer matches its current pending checkout.',
        });
      }
      yield* operations.updatePurchase({
        resourceId: purchase.id,
        attributes: {
          paymentState: payload.state,
          paymentReference: payload.reference,
          paymentEvidence: payload.evidence,
        },
      });
      if (payload.state === 'paid') {
        for (const item of cart.items) {
          yield* operations.deleteCartItem({ resourceId: item.id });
        }
        if (
          cart.promotion?.action === 'apply' &&
          cart.promotion.reservationId === purchase.reservationId
        ) {
          yield* operations.updateCart({
            resourceId: cart.id,
            attributes: { promotion: null },
          });
        }
      }
      if (purchase.reservationId !== null) {
        const promotion = {
          aggregateId,
          cartId: purchase.cartId,
          id: purchase.reservationId,
          purchaseId: purchase.id,
        };
        if (payload.state === 'paid') {
          yield* operations.redeemPromotion({ payload: promotion });
        } else {
          yield* operations.releasePromotion({ payload: promotion });
        }
      }
    }),
  },
);
