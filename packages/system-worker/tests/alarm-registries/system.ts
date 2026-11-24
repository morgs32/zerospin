import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { dispatcherV1 } from '../declarations/services/dispatcherV1.ts';

export const system = makeSystem({
  name: 'servicePublication',

  aggregates: {},
  services: { dispatcher: { releases: { 1: dispatcherV1 } } },
});

// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({ system, systemId: 'sys_servicePublication' });
