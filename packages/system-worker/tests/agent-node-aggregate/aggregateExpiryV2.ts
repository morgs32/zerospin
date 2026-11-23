import { makeAgentCommandRef } from '@zerospin/core/agent/makeAgentCommandRef';
import { makeAggregateAgentRelease } from '@zerospin/core/agent/makeAggregateAgentRelease';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import * as Effect from 'effect/Effect';

import type { expireAggregateReservationV1 } from '../declarations/contracts/aggregate/expireAggregateReservationV1.ts';
import { agentReservationV1 } from '../declarations/models/agentReservationV1.ts';

import { aggregateExpirySelectorState } from './aggregateExpiryControls.ts';

const expireAggregateReservation = makeAgentCommandRef<
  typeof expireAggregateReservationV1
>('expireAggregateReservation', 1);
const db = makeQueryDbVersion({
  models: { agentReservation: agentReservationV1 },
});
export const aggregateExpiryV2 = makeAggregateAgentRelease({
  aggregateName: 'agentAccount',
  aggregateVersion: 1,
  agentName: 'aggregateExpiry',
  agentVersion: 2,
  sessionName: 'expiry',
  db,
  contracts: { expireAggregateReservation },
  selections: {
    agentReservation: db.query.agentReservation.findMany({
      where: { id: { eq: 'arv_1' } },
    }),
  },
  wakeRules: {
    reservationExpiry: {
      selection: 'agentReservation',
      wakeAt: ({ row }) => {
        if (aggregateExpirySelectorState.fail) {
          throw new Error('Agent initialization failed');
        }
        return aggregateExpirySelectorState.disabled ? null : row.expiresAt;
      },
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
