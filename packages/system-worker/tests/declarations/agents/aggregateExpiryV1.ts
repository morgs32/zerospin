import { makeAgentCommandRef } from '@zerospin/core/agent/makeAgentCommandRef';
import { makeAggregateAgentRelease } from '@zerospin/core/agent/makeAggregateAgentRelease';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import * as Effect from 'effect/Effect';

import type { expireAggregateReservationV1 } from '../contracts/aggregate/expireAggregateReservationV1.ts';
import { agentReservationV1 } from '../models/agentReservationV1.ts';

const expireAggregateReservation = makeAgentCommandRef<
  typeof expireAggregateReservationV1
>('expireAggregateReservation', 1);
const db = makeQueryDbVersion({
  models: { agentReservation: agentReservationV1 },
});
export const aggregateExpiryV1 = makeAggregateAgentRelease({
  aggregateName: 'agentAccount',
  aggregateVersion: 1,
  agentName: 'aggregateExpiry',
  agentVersion: 1,
  sessionName: 'expiry',
  db,
  contracts: { expireAggregateReservation },
  selections: {
    agentReservation: db.query.agentReservation.findMany({}),
  },
  wakeRules: {
    reservationExpiry: {
      selection: 'agentReservation',
      wakeAt: ({ row }) => row.expiresAt,
      onWake: {
        program: ({ resourceId, stageCommand }) =>
          stageCommand(expireAggregateReservation, {
            reservationId: resourceId,
          }).pipe(Effect.asVoid),
        onFailure: ({ failure }) => Effect.fail(failure),
      },
    },
  },
});
