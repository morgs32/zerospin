import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { accountV1 } from '../declarations/aggregates/accountV1.ts';

export const system = makeSystem({
  name: 'servicePublication',

  aggregates: { account: { releases: { 1: accountV1 } } },
  services: {},
});

// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({ system, systemId: 'sys_servicePublication' });
