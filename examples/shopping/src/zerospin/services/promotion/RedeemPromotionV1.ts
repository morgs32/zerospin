import { findFirst } from '@zerospin/sdk/browser';
import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { cart } from '../../aggregates/user/models/cart/cart';
import { purchase } from '../../aggregates/user/models/purchase/purchase';

import { promotionReservation } from './models/promotionReservation/promotionReservation';
import { promotionReservationV1 } from './models/promotionReservation/PromotionReservationV1';
import { PromotionDecisionSchema } from './promotionDecision';

export const redeemPromotion = sdk.makeServiceContractRelease(
  sdk.defineServiceContract('redeemPromotion'),
  {
    version: 1,
    payload: {
      id: sdk.modelId({ model: promotionReservation }),
      aggregateId: sdk.primitives.text(),
      cartId: sdk.modelId({ model: cart }),
      purchaseId: sdk.modelId({ model: purchase }),
    },
    result: PromotionDecisionSchema,
    failures: {
      conflict: sdk.ContractError.schema({ code: 'promotion-conflict' }),
    },
    models: {
      promotionReservation: {
        model: promotionReservationV1,
        fields: [
          'createdAt',
          'updatedAt',
          'cartId',
          'aggregateId',
          'purchaseId',
          'expiresAt',
          'status',
        ],
      },
    },
    operations: { updateReservation: promotionReservationV1.operations.update },
    program: Effect.fn('redeemPromotion.program')(function* ({
      failures,
      payload,
      db,
      operations,
    }) {
      const row = yield* findFirst({
        db,
        model: db.models.promotionReservation,
        where: { id: { eq: payload.id } },
      });
      if (
        !row ||
        row.aggregateId !== payload.aggregateId ||
        row.cartId !== payload.cartId ||
        row.purchaseId !== payload.purchaseId ||
        (row.status !== 'committed' && row.status !== 'redeemed')
      ) {
        return yield* failures.conflict.make({
          message:
            'Only the exact committed Purchase reservation can be redeemed.',
        });
      }
      if (row.status !== 'redeemed') {
        yield* operations.updateReservation({
          resourceId: payload.id,
          attributes: { status: 'redeemed' },
        });
      }
      return {
        reservationId: row.id,
        status: 'redeemed' as const,
        purchaseId: row.purchaseId,
        expiresAt: row.expiresAt,
      };
    }),
  },
);
