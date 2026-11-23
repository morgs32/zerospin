import { findFirst } from '@zerospin/sdk/browser';
import * as sdk from '@zerospin/sdk/browser';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';

import { cart } from '../../aggregates/user/models/cart/cart';
import { purchase } from '../../aggregates/user/models/purchase/purchase';

import { promotionReservation } from './models/promotionReservation/promotionReservation';
import { promotionReservationV1 } from './models/promotionReservation/PromotionReservationV1';
import { PromotionDecisionSchema } from './promotionDecision';

export const commitPromotion = sdk.makeServiceContractRelease(
  sdk.defineServiceContract('commitPromotion'),
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
    program: Effect.fn('commitPromotion.program')(function* ({
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
        row.cartId !== payload.cartId
      ) {
        return yield* failures.conflict.make({
          message: 'Reservation not found for this cart.',
        });
      }
      if (
        (row.status === 'committed' || row.status === 'redeemed') &&
        row.purchaseId === payload.purchaseId
      ) {
        return {
          reservationId: row.id,
          status: row.status,
          purchaseId: row.purchaseId,
          expiresAt: row.expiresAt,
        };
      }
      if (
        row.status !== 'reserved' ||
        row.purchaseId !== null ||
        row.expiresAt === null ||
        row.expiresAt <= (yield* Clock.currentTimeMillis)
      ) {
        return yield* failures.conflict.make({
          message: 'The reservation expired or is no longer available.',
        });
      }
      yield* operations.updateReservation({
        resourceId: payload.id,
        attributes: { status: 'committed', purchaseId: payload.purchaseId },
      });
      return {
        reservationId: row.id,
        status: 'committed' as const,
        purchaseId: payload.purchaseId,
        expiresAt: row.expiresAt,
      };
    }),
  },
);
