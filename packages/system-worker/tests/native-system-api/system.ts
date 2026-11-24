import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { aggregateExpiryV1 } from '../declarations/agents/aggregateExpiryV1.ts';
import { serviceExpiryV1 } from '../declarations/agents/serviceExpiryV1.ts';
import { agentAccountV1 } from '../declarations/aggregates/agentAccountV1.ts';
import { agentReservationsV1 } from '../declarations/services/agentReservationsV1.ts';

import { accountV1 } from './accountV1.ts';
import { reservationsV1 } from './reservationsV1.ts';

export const system = makeSystem({
  name: 'servicePublication',
  aggregateAgents: {
    agentAccount: {
      aggregateExpiry: { releases: { 1: aggregateExpiryV1 }, active: 1 },
    },
  },
  serviceAgents: {
    agentReservations: {
      serviceExpiry: { releases: { 1: serviceExpiryV1 }, active: 1 },
    },
  },
  aggregates: {
    account: { releases: { 1: accountV1 } },
    agentAccount: { releases: { 1: agentAccountV1 } },
  },
  services: {
    reservations: { releases: { 1: reservationsV1 } },
    agentReservations: { releases: { 1: agentReservationsV1 } },
  },
});

// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({ system, systemId: 'sys_servicePublication' });
