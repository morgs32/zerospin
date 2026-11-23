import { makeServiceAgentRelease } from '@zerospin/core/agent/makeServiceAgentRelease';
import { makeQueryDbVersion } from '@zerospin/core/models/make/makeQueryDbVersion';

import { reservationV1 as reservation } from '../declarations/models/reservationV1.ts';

const reservationQueries = makeQueryDbVersion({ models: { reservation } });

export const projectionReader = makeServiceAgentRelease({
  serviceName: 'reservations',
  serviceVersion: 1,
  agentName: 'projectionReader',
  agentVersion: 1,
  sessionName: 'reader',
  db: reservationQueries,
  contracts: {},
  selections: {
    reservation: reservationQueries.query.reservation.findMany({}),
  },
});
