import { makeConfig } from '@zerospin/sdk';

import { system } from './src/system';

export const ownerReleaseSources = {
  aggregates: {
    list: {
      1: { module: './src/listAggregateV1.ts', export: 'listAggregateV1' },
    },
  },
};

export default makeConfig({ system, systemId: 'sys_list' });
