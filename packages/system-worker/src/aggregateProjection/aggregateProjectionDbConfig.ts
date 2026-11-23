import { aggregateExposedCommandsTable } from '@zerospin/core/aggregateSession/aggregateExposedCommandsTable';
import { CommandResolutionSchema } from '@zerospin/core/contracts/CommandResolutionSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

const materializationHead = makeTable({
  name: 'materializationHead',
  shape: {
    singletonId: primitives.integer({ primaryKey: true }),
    aggregateIndex: primitives.integer(),
    dispositionChainHash: primitives.text(),
  },
});

/** Actor resources, checkpoint and complete pending publication commit together. */
export const aggregateProjectionDbConfig = makeDbConfig({
  tables: {
    exposedCommandOutbox: makeTable({
      name: 'exposedCommandOutbox',
      shape: {
        ...aggregateExposedCommandsTable.shape,
        commandResolution: primitives.json({
          schema: CommandResolutionSchema,
          nullable: true,
        }),
      },
    }),
    materializationHead,
  },
});

/** Agent resources and checkpoint commit with complete pending public publications. */
export const aggregateAgentProjectionDbConfig = makeDbConfig({
  tables: {
    exposedCommandOutbox: makeTable({
      name: 'exposedCommandOutbox',
      shape: {
        ...aggregateExposedCommandsTable.shape,
      },
    }),
    materializationHead,
  },
});
