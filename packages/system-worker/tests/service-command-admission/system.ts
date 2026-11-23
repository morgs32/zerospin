import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { reservationsV1 } from '../declarations/services/reservationsV1.ts';

export const system = makeSystem({
  name: 'servicePublication',
  aggregates: {},
  services: { reservations: { releases: { 1: reservationsV1 }, canonical: 1 } },
});

// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({ system, systemId: 'sys_servicePublication' });
