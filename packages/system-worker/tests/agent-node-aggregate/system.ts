import { makeConfig } from '@zerospin/core/system/make/makeConfig';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { agentAccountV1 } from '../declarations/aggregates/agentAccountV1.ts';

import { agentAccountV2 } from './agentAccountV2.ts';
import { aggregateExpiryV1 } from './aggregateExpiryV1.ts';
import { aggregateExpiryV2 } from './aggregateExpiryV2.ts';
export const system = makeSystem({
  name: 'servicePublication',
  aggregateAgents: {
    agentAccount: {
      aggregateExpiry: {
        releases: { 1: aggregateExpiryV1, 2: aggregateExpiryV2 },
        active: 1,
      },
    },
  },
  aggregates: {
    agentAccount: {
      releases: { 1: agentAccountV1, 2: agentAccountV2 },
    },
  },
});
// oxlint-disable-next-line import/no-default-export -- The production config alias supplies this scenario's System.
export default makeConfig({ system, systemId: 'sys_servicePublication' });
