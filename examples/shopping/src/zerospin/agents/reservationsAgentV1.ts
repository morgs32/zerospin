import {
  makeAgentCommandRef,
  makeQueryDbVersion,
  makeServiceAgentRelease,
} from '@zerospin/sdk';
import * as Effect from 'effect/Effect';

import { promotionReservationV1 } from '../services/promotion/models/promotionReservation/PromotionReservationV1';
import type { releaseUncommittedReservationV1 } from '../services/promotion/ReleaseUncommittedReservationV1';

const releaseUncommittedReservation = makeAgentCommandRef<
  typeof releaseUncommittedReservationV1
>('releaseUncommittedReservation', 1);

const db = makeQueryDbVersion({
  models: { promotionReservation: promotionReservationV1 },
});
export const reservationsAgentV1 = makeServiceAgentRelease({
  serviceName: 'promotion',
  serviceVersion: 1,
  agentVersion: 1,
  agentName: 'reservations',
  sessionName: 'reservations',
  db,
  contracts: { releaseUncommittedReservation },
  selections: {
    promotionReservation: db.query.promotionReservation.findMany({
      where: { status: { eq: 'reserved' }, purchaseId: { isNull: true } },
    }),
  },
  wakeRules: {
    reservationExpiry: {
      selection: 'promotionReservation',
      wakeAt: ({ row }) => row.expiresAt,
      onWake: {
        program: ({ resourceId, at, stageCommand }) =>
          stageCommand(releaseUncommittedReservation, {
            reservationId: resourceId,
            expectedExpiresAt: at,
          }).pipe(Effect.asVoid),
        onFailure: ({ failure }) => Effect.fail(failure),
      },
    },
  },
});
