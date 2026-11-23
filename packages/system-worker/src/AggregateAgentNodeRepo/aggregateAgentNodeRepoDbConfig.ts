import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

import {
  agentNodeBaselineDbConfig,
  agentNodeRepoDbConfig,
} from '../agentNodeRepo/agentNodeRepoDbConfig.js';

/** The immutable schema installed before Agent optimistic staging. */
export const aggregateAgentNodeRepoBaseline = makeDbConfig({
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
        aggregateVersion: primitives.integer(),
      },
    }),
    materializationHead: makeTable({
      name: 'materializationHead',
      shape: {
        agentVersion: primitives.integer(),
        aggregateVersion: primitives.integer(),
        aggregateIndex: primitives.integer(),
        dispositionChainHash: primitives.text(),
      },
    }),
  },
});

export const aggregateAgentNodeRepoDbConfig = makeDbConfig({
  tables: {
    ...aggregateAgentNodeRepoBaseline.tables,
    pendingAgentCommands: agentNodeRepoDbConfig.tables.pendingAgentCommands,
  },
});
