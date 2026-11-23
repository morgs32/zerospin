import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { cartV1 } from '../models/cart/CartV1';
import { cartItemV1 } from '../models/cartItem/CartItemV1';
import { purchase } from '../models/purchase/purchase';
import { purchaseV1 } from '../models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../models/purchaseItem/PurchaseItemV1';

import { matchesPaymentCheckout } from './utils/matchesPaymentCheckout';

export const markPaymentForReconciliationV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('markPaymentForReconciliation'),
  {
    version: 1,
    payload: {
      purchaseId: sdk.modelId({ model: purchase }),
      key: sdk.primitives.text(),
      total: sdk.primitives.integer(),
    },
    models: {
      cart: {
        model: cartV1,
        fields: ['checkoutPurchaseId'],
      },
      cartItem: {
        model: cartItemV1,
        fields: ['cartId', 'productId', 'quantity'],
      },
      purchase: {
        model: purchaseV1,
        fields: ['cartId', 'total', 'paymentState'],
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
    operations: { updatePurchase: purchaseV1.operations.update },
    program: Effect.fn('markPaymentForReconciliationV1.program')(function* ({
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
        !matchesPaymentCheckout({ aggregateId, payload, purchase, cart })
      ) {
        return yield* failures.staleObservation.make({
          message:
            'Payment evidence no longer matches its current pending checkout.',
        });
      }
      yield* operations.updatePurchase({
        resourceId: purchase.id,
        attributes: { paymentState: 'needs_reconciliation' },
      });
    }),
  },
);
