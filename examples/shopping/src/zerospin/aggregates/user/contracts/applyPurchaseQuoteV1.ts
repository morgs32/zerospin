import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { PurchaseQuote, PurchaseSnapshot } from '../../../purchaseQuote';
import { cartV1 } from '../models/cart/CartV1';
import { purchaseV1 } from '../models/purchase/PurchaseV1';
import { purchaseItemV1 } from '../models/purchaseItem/PurchaseItemV1';

import { commitExternalPromotionDefinitionV1 } from './commitExternalPromotionDefinitionV1';
import { processExternalPaymentDefinitionV1 } from './processExternalPaymentDefinitionV1';

export const applyPurchaseQuoteV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('applyPurchaseQuote'),
  {
    version: 1,
    payload: {
      snapshot: sdk.primitives.json({ schema: PurchaseSnapshot }),
      quote: sdk.primitives.json({ schema: PurchaseQuote, nullable: true }),
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
      updatePurchase: purchaseV1.operations.update,
      updatePurchaseItem: purchaseItemV1.operations.update,
      processPayment: processExternalPaymentDefinitionV1.externalOperation,
      commitPromotion: commitExternalPromotionDefinitionV1.externalOperation,
    },
    failures: {
      staleObservation: sdk.ContractError.schema({
        code: 'stale-purchase-quote',
      }),
    },
    program: Effect.fn('applyPurchaseQuoteV1.program')(function* ({
      payload: { snapshot, quote },
      aggregateId,
      db,
      failures,
      operations,
    }) {
      const cart = yield* sdk.findFirst({
        db,
        model: db.models.cart,
        where: { id: { eq: snapshot.cartId } },
      });
      const purchase = yield* sdk.findFirst({
        db,
        model: db.models.purchase,
        where: { id: { eq: snapshot.purchaseId } },
        with: { items: true },
      });
      if (
        !cart ||
        cart.checkoutPurchaseId !== snapshot.purchaseId ||
        !purchase ||
        purchase.cartId !== snapshot.cartId ||
        purchase.paymentState !== 'preparing' ||
        purchase.items.length !== snapshot.items.length ||
        snapshot.items.some(
          line =>
            !purchase.items.some(
              item =>
                item.id === line.id &&
                item.productId === line.productId &&
                item.quantity === line.quantity,
            ),
        )
      ) {
        return yield* failures.staleObservation.make({
          message: 'The quote no longer matches the current checkout purchase.',
        });
      }
      if (
        !quote ||
        quote.cartId !== snapshot.cartId ||
        quote.purchaseId !== snapshot.purchaseId ||
        quote.items.length !== snapshot.items.length ||
        new Set(quote.items.map(item => item.id)).size !== quote.items.length ||
        quote.items.some(
          item =>
            !Number.isSafeInteger(item.price) ||
            item.price < 0 ||
            !Number.isSafeInteger(item.quantity) ||
            !snapshot.items.some(
              line =>
                line.id === item.id &&
                line.productId === item.productId &&
                line.quantity === item.quantity,
            ),
        ) ||
        !Number.isSafeInteger(quote.subtotal) ||
        quote.subtotal < 0 ||
        quote.subtotal !==
          quote.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
      ) {
        // No payment request has started, so a refused or unavailable quote can safely unlock the cart.
        yield* operations.updatePurchase({
          resourceId: purchase.id,
          attributes: { paymentState: 'refused' },
        });
        return;
      }
      for (const item of quote.items) {
        yield* operations.updatePurchaseItem({
          resourceId: item.id,
          attributes: { name: item.name, price: item.price },
        });
      }
      if (purchase.reservationId !== null) {
        yield* operations.updatePurchase({
          resourceId: purchase.id,
          attributes: {
            subtotal: quote.subtotal,
          },
        });
        yield* operations.commitPromotion({
          payload: {
            aggregateId,
            cartId: purchase.cartId,
            reservationId: purchase.reservationId,
            purchaseId: purchase.id,
          },
        });
        return;
      }
      yield* operations.updatePurchase({
        resourceId: purchase.id,
        attributes: {
          subtotal: quote.subtotal,
          discount: 0,
          total: quote.subtotal,
          paymentState: 'pending',
        },
      });
      yield* operations.processPayment({
        payload: {
          purchaseId: purchase.id,
          total: quote.subtotal,
          key: `shopping:${aggregateId}:${purchase.id}:payment`,
        },
      });
    }),
  },
);
