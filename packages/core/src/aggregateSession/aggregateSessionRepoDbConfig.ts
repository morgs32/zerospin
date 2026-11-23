import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { StagingOutcomeSchema } from '../contracts/StagingOutcomeSchema.ts';
import { makeDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';
import { InverseOperationSchema } from '../models/InverseOperationSchema.ts';

export const aggregateSessionRepoDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        sessionIndex: primitives.integer({ primaryKey: true }),
        commandName: primitives.text(),
        payload: primitives.text(),
        stagingOutcome: primitives.json({ schema: StagingOutcomeSchema }),
        nodeId: primitives.text({ nullable: true }),
        nodeIndex: primitives.integer({ nullable: true }),
        pushIndex: primitives.integer({ nullable: true }),
        inverseOperations: primitives.json({
          schema: Schema.Array(InverseOperationSchema),
          nullable: true,
        }),
        aggregateIndex: primitives.integer({ nullable: true }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'commands_resolution',
          columns: ['aggregateIndex'],
          unique: true,
        },
        {
          name: 'commands_node_original',
          columns: ['nodeId', 'nodeIndex'],
          unique: true,
        },
      ],
    }),

    sessionMetadata: makeTable({
      name: 'sessionMetadata',
      shape: {
        sessionId: primitives.id({ abbreviation: 'sesn', primaryKey: true }),
        lastSessionIndex: primitives.integer(),
        afterNodeIndex: primitives.integer(),
        aggregateIndex: primitives.integer(),

        dispositionChainHash: primitives.text(),
      },
    }),
  },
});
