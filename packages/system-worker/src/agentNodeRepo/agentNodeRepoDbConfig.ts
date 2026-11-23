import { pendingAgentWakesDbConfig } from '@zerospin/core/agent/pendingAgentWakesDbConfig';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { AgentMaterializedTablesSchema } from './agentMaterializedTables.js';

/** Fixed pending-wake, initialization and producer bookkeeping shared by both Agent execution Repos. */
export const agentNodeBaselineDbConfig = makeDbConfig({
  tables: {
    pendingAgentWakes: pendingAgentWakesDbConfig.tables.pendingAgentWakes,
    initializationState: makeTable({
      name: 'initializationState',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        generation: primitives.integer(),
        binding: primitives.json({ schema: Schema.Json }),
        status: primitives.enum({
          values: [
            'initializing',
            'ready',
            'initializationFailed',
            'stopping',
            'stopped',
          ],
        }),
        error: primitives.text({ nullable: true }),
        materializedTables: primitives.json({
          schema: AgentMaterializedTablesSchema,
        }),
      },
    }),
    producerPosition: makeTable({
      name: 'producerPosition',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        lastIndex: primitives.integer(),
      },
    }),
  },
});

export const agentNodeRepoDbConfig = makeDbConfig({
  tables: {
    ...agentNodeBaselineDbConfig.tables,
    pendingAgentCommands: pendingAgentWakesDbConfig.tables.pendingAgentCommands,
  },
});

// Keep the migration SQL immutable. Existing deliveries retain their original IDs
// and producer positions and have no local prediction to reconstruct.
export const agentCommandJournalMigration = {
  id: 1,
  name: 'add pending Agent commands',
  sql: [
    'CREATE TABLE "pendingAgentCommands" ("producerIndex" integer PRIMARY KEY NOT NULL, "id" text NOT NULL UNIQUE, "commandName" text NOT NULL, "contractVersion" integer NOT NULL, "payload" text NOT NULL, "appliedAt" integer NOT NULL);',
  ],
};
