import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

import {
  agentNodeBaselineDbConfig,
  agentNodeRepoDbConfig,
} from '../agentNodeRepo/agentNodeRepoDbConfig.js';

/** The immutable schema installed before Agent optimistic staging. */
export const serviceAgentNodeRepoBaseline = makeDbConfig({
  tables: {
    ...agentNodeBaselineDbConfig.tables,
    commandDeliveryOutbox: makeTable({
      name: 'commandDeliveryOutbox',
      shape: {
        generation: primitives.integer(),
        producerIndex: primitives.integer({ primaryKey: true }),
        id: primitives.id({ abbreviation: 'cmd', unique: true }),
        commandName: primitives.text(),
        contractVersion: primitives.integer(),
        payload: primitives.text(),
        agentVersion: primitives.integer(),
        serviceVersion: primitives.integer(),
      },
    }),
    materializationHead: makeTable({
      name: 'materializationHead',
      shape: {
        agentVersion: primitives.integer(),
        serviceVersion: primitives.integer(),
        serviceIndex: primitives.integer(),
        dispositionChainHash: primitives.text(),
      },
    }),
  },
});

export const serviceAgentNodeRepoDbConfig = makeDbConfig({
  tables: {
    ...serviceAgentNodeRepoBaseline.tables,
    pendingAgentCommands: agentNodeRepoDbConfig.tables.pendingAgentCommands,
  },
});
