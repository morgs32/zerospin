import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { agentReservationsV1 } from '../declarations/services/agentReservationsV1.ts';

import { agentReservationsV2 } from './agentReservationsV2.ts';
import { serviceExpiryV1 } from './serviceExpiryV1.ts';
import { serviceExpiryV2 } from './serviceExpiryV2.ts';
export const system = makeSystem({
  name: 'servicePublication',
  serviceAgents: {
    agentReservations: {
      serviceExpiry: {
        releases: { 1: serviceExpiryV1, 2: serviceExpiryV2 },
        active: 1,
      },
    },
  },
  aggregates: {},
  services: {
    agentReservations: {
      releases: { 1: agentReservationsV1, 2: agentReservationsV2 },
    },
  },
});
// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({ system, systemId: 'sys_servicePublication' });
