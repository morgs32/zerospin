import { makeAgentCommandRef } from '@zerospin/core/agent/makeAgentCommandRef';
import { makeServiceAgentRelease } from '@zerospin/core/agent/makeServiceAgentRelease';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';
import * as Effect from 'effect/Effect';

import type { expireServiceReservationV1 } from '../declarations/contracts/service/expireServiceReservationV1.ts';
import { agentReservationV1 } from '../declarations/models/agentReservationV1.ts';

import { serviceExpirySelectorState } from './serviceExpiryControls.ts';

const expireServiceReservation = makeAgentCommandRef<
  typeof expireServiceReservationV1
>('expireServiceReservation', 1);
const db = makeQueryDbVersion({
  models: { agentReservation: agentReservationV1 },
});
export const serviceExpiryV1 = makeServiceAgentRelease({
  serviceName: 'agentReservations',
  serviceVersion: 1,
  agentName: 'serviceExpiry',
  agentVersion: 1,
  sessionName: 'expiry',
  db,
  contracts: { expireServiceReservation },
  selections: {
    agentReservation: db.query.agentReservation.findMany({
      where: { expiresAt: { gt: 0 } },
    }),
  },
  wakeRules: {
    reservationExpiry: {
      selection: 'agentReservation',
      wakeAt: ({ row }) => {
        if (serviceExpirySelectorState.fail) {
          throw new Error('Agent initialization failed');
        }
        return serviceExpirySelectorState.disabled ? null : row.expiresAt;
      },
      onWake: {
        program: ({ resourceId, stageCommand }) =>
          stageCommand(expireServiceReservation, {
            reservationId: resourceId,
          }).pipe(Effect.asVoid),
        onFailure: ({ failure }) => Effect.fail(failure),
      },
    },
  },
});
