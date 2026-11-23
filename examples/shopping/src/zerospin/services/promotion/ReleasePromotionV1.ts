import { findFirst } from '@zerospin/sdk/browser';
import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { cart } from '../../aggregates/user/models/cart/cart';
import { purchase } from '../../aggregates/user/models/purchase/purchase';

import { promotionReservation } from './models/promotionReservation/promotionReservation';
import { promotionReservationV1 } from './models/promotionReservation/PromotionReservationV1';
import { PromotionDecisionSchema } from './promotionDecision';

export const releasePromotion = sdk.makeServiceContractRelease(
  sdk.defineServiceContract('releasePromotion'),
  {
    version: 1,
    payload: {
      id: sdk.modelId({ model: promotionReservation }),
      aggregateId: sdk.primitives.text(),
      cartId: sdk.modelId({ model: cart }),
      purchaseId: sdk.modelId({
        model: purchase,
        nullable: true,
      }),
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
    operations: {
      createReservation: promotionReservationV1.operations.create,
      updateReservation: promotionReservationV1.operations.update,
    },
    program: Effect.fn('releasePromotion.program')(function* ({
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
        row &&
        (row.aggregateId !== payload.aggregateId ||
          row.cartId !== payload.cartId ||
          (row.purchaseId !== null && row.purchaseId !== payload.purchaseId))
      ) {
        return yield* failures.conflict.make({
          message: 'Reservation or Purchase identity conflicts.',
        });
      }
      if (row?.status === 'redeemed') {
        return yield* failures.conflict.make({
          message: 'A redeemed reservation cannot be released.',
        });
      }
      if (row?.status === 'committed' && payload.purchaseId === null) {
        return yield* failures.conflict.make({
          message: 'The committed Purchase identity is required.',
        });
      }
      if (!row) {
        yield* operations.createReservation({
          resourceId: payload.id,
          attributes: {
            aggregateId: payload.aggregateId,
            cartId: payload.cartId,
            purchaseId: payload.purchaseId,
            expiresAt: null,
            status: 'released',
          },
        });
      } else if (row.status !== 'denied') {
        if (
          row.status !== 'released' ||
          row.purchaseId !== payload.purchaseId
        ) {
          yield* operations.updateReservation({
            resourceId: payload.id,
            attributes: { status: 'released', purchaseId: payload.purchaseId },
          });
        }
      }
      return {
        reservationId: payload.id,
        status:
          row?.status === 'denied'
            ? ('denied' as const)
            : ('released' as const),
        purchaseId:
          row?.status === 'denied' ? row.purchaseId : payload.purchaseId,
        expiresAt: row?.expiresAt ?? null,
      };
    }),
  },
);
