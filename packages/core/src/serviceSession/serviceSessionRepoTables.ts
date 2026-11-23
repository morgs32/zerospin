import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { StagingOutcomeSchema } from '../contracts/StagingOutcomeSchema.ts';
import { makeDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';
import { InverseOperationSchema } from '../models/InverseOperationSchema.ts';

export const serviceSessionRepoDbConfig = makeDbConfig({
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
        serviceIndex: primitives.integer({ nullable: true }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'commands_resolution',
          columns: ['serviceIndex'],
          unique: true,
        },
        {
          name: 'commands_node_original',
          columns: ['nodeId', 'nodeIndex'],
          unique: true,
        },
      ],
    }),

    serviceSessionMetadata: makeTable({
      name: 'serviceSessionMetadata',
      shape: {
        lastSessionIndex: primitives.integer(),
        afterNodeIndex: primitives.integer(),
        serviceIndex: primitives.integer(),
        dispositionChainHash: primitives.text(),
      },
    }),
  },
});

export const serviceSessionRepoTables = serviceSessionRepoDbConfig.tables;
export const serviceSessionRepoSchema = serviceSessionRepoDbConfig.schema;
export const serviceSessionMetadataDrizzleSchema =
  serviceSessionRepoSchema.serviceSessionMetadata;
