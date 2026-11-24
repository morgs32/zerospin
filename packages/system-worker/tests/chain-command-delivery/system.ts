import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { accountV1 } from './accountV1.ts';
import { accountV2 } from './accountV2.ts';
import { dispatcherV1 } from './dispatcherV1.ts';
import { reservationsV2 } from './reservationsV2.ts';

export const system = makeSystem({
  name: 'servicePublication',

  aggregates: {
    account: { releases: { 1: accountV1, 2: accountV2 } },
  },
  services: {
    dispatcher: { releases: { 1: dispatcherV1 } },
    reservations: { releases: { 2: reservationsV2 } },
  },
});

// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({ system, systemId: 'sys_servicePublication' });
