import { makeConfig } from '@zerospin/sdk';

import { system } from './src/system';

export const ownerReleaseSources = {
  aggregates: {
    user: {
      1: { module: './src/userAggregateV1.ts', export: 'userAggregateV1' },
    },
  },
};

export default makeConfig({ system, systemId: 'sys_username' });
