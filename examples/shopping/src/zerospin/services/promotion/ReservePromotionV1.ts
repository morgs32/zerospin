import { findMany } from '@zerospin/sdk/browser';
import * as sdk from '@zerospin/sdk/browser';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';

import { cart } from '../../aggregates/user/models/cart/cart';

import { promotionReservation } from './models/promotionReservation/promotionReservation';
import { promotionReservationV1 } from './models/promotionReservation/PromotionReservationV1';
import { PromotionDecisionSchema } from './promotionDecision';
import { promotionCapacity, promotionDuration } from './promotionPolicy';

export const reservePromotion = sdk.makeServiceContractRelease(
  sdk.defineServiceContract('reservePromotion'),
  {
    version: 1,
    failures: {
      conflict: sdk.ContractError.schema({ code: 'promotion-conflict' }),
    },
    payload: {
      id: sdk.modelId({ model: promotionReservation }),
      aggregateId: sdk.primitives.text(),
      cartId: sdk.modelId({ model: cart }),
    },
    result: PromotionDecisionSchema,
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
    operations: { createReservation: promotionReservationV1.operations.create },
    program: Effect.fn('reservePromotion.program')(function* ({
      failures,
      payload,
      db,
      operations,
    }) {
      const now = yield* Clock.currentTimeMillis;
      const rows = yield* findMany({
        db,
        model: db.models.promotionReservation,
      });
      const existing = rows.find(row => row.id === payload.id);
      if (existing) {
        if (
          existing.aggregateId !== payload.aggregateId ||
          existing.cartId !== payload.cartId
        ) {
          return yield* failures.conflict.make({
            message: 'Reservation identity conflicts.',
          });
        }
        return {
          reservationId: existing.id,
          status: existing.status,
          purchaseId: existing.purchaseId,
          expiresAt: existing.expiresAt,
        };
      }
      const hasActiveReservation = rows.some(
        row =>
          row.aggregateId === payload.aggregateId &&
          row.cartId === payload.cartId &&
          (row.status === 'committed' ||
            (row.status === 'reserved' &&
              row.expiresAt !== null &&
              row.expiresAt > now)),
      );
      const used = rows.filter(
        row =>
          row.status === 'committed' ||
          row.status === 'redeemed' ||
          (row.status === 'reserved' &&
            row.expiresAt !== null &&
            row.expiresAt > now),
      ).length;
      const status =
        !hasActiveReservation && used < promotionCapacity
          ? ('reserved' as const)
          : ('denied' as const);
      const expiresAt = status === 'reserved' ? now + promotionDuration : null;
      yield* operations.createReservation({
        resourceId: payload.id,
        attributes: {
          aggregateId: payload.aggregateId,
          cartId: payload.cartId,
          purchaseId: null,
          expiresAt,
          status,
        },
      });
      return { reservationId: payload.id, status, purchaseId: null, expiresAt };
    }),
  },
);
