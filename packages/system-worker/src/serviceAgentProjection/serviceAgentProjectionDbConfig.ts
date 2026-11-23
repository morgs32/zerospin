import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable } from '@zerospin/shapes';

import { serviceExposedCommandsTable } from '../serviceProjection/serviceExposedCommandsTable.js';
import { serviceProjectionDbConfig } from '../serviceProjection/serviceProjectionDbConfig.js';

/** Complete pending public Agent output commits with its materialization. */
export const serviceAgentProjectionDbConfig = makeDbConfig({
  tables: {
    materializationHead: serviceProjectionDbConfig.tables.materializationHead,
    exposedCommandOutbox: makeTable({
      name: 'exposedCommandOutbox',
      shape: {
        ...serviceExposedCommandsTable.shape,
      },
    }),
  },
});

export type IServiceAgentExposedPublication =
  typeof serviceAgentProjectionDbConfig.tables.exposedCommandOutbox.codec.Type;
