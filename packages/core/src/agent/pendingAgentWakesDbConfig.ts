import { makeTable, primitives } from '@zerospin/shapes';

import { makeDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';

/** A pending wake belongs to exactly one release rule and selected resource. */
export const pendingAgentWakesDbConfig = makeDbConfig({
  tables: {
    pendingAgentCommands: makeTable({
      name: 'pendingAgentCommands',
      shape: {
        producerIndex: primitives.integer({ primaryKey: true }),
        id: primitives.id({ abbreviation: 'cmd', unique: true }),
        commandName: primitives.text(),
        contractVersion: primitives.integer(),
        payload: primitives.text(),
        appliedAt: primitives.integer(),
      },
    }),
    pendingAgentWakes: makeTable({
      name: 'pendingAgentWakes',
      shape: {
        ruleName: primitives.text(),
        resourceId: primitives.text(),
        at: primitives.integer(),
      },
      indexes: [
        {
          name: 'pending_agent_wake_identity',
          columns: ['ruleName', 'resourceId'],
          unique: true,
        },
        {
          name: 'pending_agent_wake_deadline',
          columns: ['at', 'ruleName', 'resourceId'],
        },
      ],
    }),
  },
});
