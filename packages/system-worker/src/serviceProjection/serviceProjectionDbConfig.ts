import { CommandResolutionSchema } from '@zerospin/core/contracts/CommandResolutionSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

import { serviceExposedCommandsTable } from './serviceExposedCommandsTable.js';

/** Resource progress and complete pending selected publication commit together. */
export const serviceProjectionDbConfig = makeDbConfig({
  tables: {
    materializationHead: makeTable({
      name: 'materializationHead',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        serviceIndex: primitives.integer(),
        dispositionChainHash: primitives.text(),
      },
    }),
    exposedCommandOutbox: makeTable({
      name: 'exposedCommandOutbox',
      shape: {
        ...serviceExposedCommandsTable.shape,
        commandResolution: primitives.json({
          schema: CommandResolutionSchema,
          nullable: true,
        }),
      },
    }),
  },
});

export type IServiceExposedPublication =
  typeof serviceProjectionDbConfig.tables.exposedCommandOutbox.codec.Type;
