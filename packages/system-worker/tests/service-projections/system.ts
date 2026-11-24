import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { reservationsV1 } from '../declarations/services/reservationsV1.ts';

import { accountV1 } from './accountV1.ts';
import { projectionReader } from './projectionReader.ts';

export const system = makeSystem({
  name: 'servicePublication',
  serviceAgents: {
    reservations: {
      projectionReader: { releases: { 1: projectionReader }, active: 1 },
    },
  },
  aggregates: { account: { releases: { 1: accountV1 } } },
  services: { reservations: { releases: { 1: reservationsV1 } } },
});

// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({ system, systemId: 'sys_servicePublication' });
