import * as sdk from '@zerospin/sdk/browser';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';

import { promotionReservation } from './models/promotionReservation/promotionReservation';
import { promotionReservationV1 } from './models/promotionReservation/PromotionReservationV1';

export const releaseUncommittedReservationV1 = sdk.makeServiceContractRelease(
  sdk.defineServiceContract('releaseUncommittedReservation'),
  {
    version: 1,
    payload: {
      reservationId: sdk.modelId({ model: promotionReservation }),
      expectedExpiresAt: sdk.primitives.integer(),
    },
    failures: {
      notReleasable: sdk.ContractError.schema({
        code: 'promotion-reservation-not-releasable',
      }),
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
    program: Effect.fn('releaseUncommittedReservationV1.program')(function* ({
      payload,
      db,
      failures,
      operations,
    }) {
      const reservation = yield* sdk.findFirst({
        db,
        model: db.models.promotionReservation,
        where: { id: { eq: payload.reservationId } },
      });
      const now = yield* Clock.currentTimeMillis;
      if (
        !reservation ||
        reservation.status !== 'reserved' ||
        reservation.purchaseId !== null ||
        reservation.expiresAt !== payload.expectedExpiresAt ||
        payload.expectedExpiresAt > now
      ) {
        return yield* failures.notReleasable.make({
          message:
            'The uncommitted reservation must be due at its expected expiry.',
        });
      }
      yield* operations.updateReservation({
        resourceId: reservation.id,
        attributes: { status: 'released' },
      });
    }),
  },
);
