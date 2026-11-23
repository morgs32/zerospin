import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';

import { agentNodeFanoutDbConfig } from '../agentNodeFanout/agentNodeFanoutDbConfig.js';
import { serviceExposedCommandsTable } from '../serviceProjection/serviceExposedCommandsTable.js';

/** Retained public Agent history and the fixed Node Repo acknowledgement. */
export const serviceAgentVersionChainDbConfig = makeDbConfig({
  tables: {
    nodeDeliveryAcknowledgement:
      agentNodeFanoutDbConfig.tables.nodeDeliveryAcknowledgement,
    exposedCommands: serviceExposedCommandsTable,
  },
});
