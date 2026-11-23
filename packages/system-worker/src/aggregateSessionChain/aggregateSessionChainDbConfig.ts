import { aggregateExposedCommandsTable } from '@zerospin/core/aggregateSession/aggregateExposedCommandsTable';
import { CommandResolutionSchema } from '@zerospin/core/contracts/CommandResolutionSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

import { agentNodeFanoutDbConfig } from '../agentNodeFanout/agentNodeFanoutDbConfig.js';

import { AggregateConnectionCapabilitiesSchema } from './connectionCapabilities.js';

const resolution = CommandResolutionSchema.fields;

/** Actor history atomically retains public commands and optional private resolutions. */
export const aggregateSessionChainDbConfig = makeDbConfig({
  tables: {
    historyHead: makeTable({
      name: 'historyHead',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        aggregateIndex: primitives.integer(),
        dispositionChainHash: primitives.text(),
      },
    }),
    archives: makeTable({
      name: 'archives',
      shape: { firstAggregateIndex: primitives.integer({ primaryKey: true }) },
    }),
    archiveFanoutSubscribers: makeTable({
      name: 'archiveFanoutSubscribers',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        acknowledgedAggregateIndex: primitives.integer(),
      },
    }),
    connectionLocks: makeTable({
      name: 'connectionLocks',
      shape: {
        connectionId: primitives.text({ primaryKey: true }),
        modelNames: primitives.json({
          schema: AggregateConnectionCapabilitiesSchema.fields.modelNames,
        }),
        contractVersions: primitives.json({
          schema: AggregateConnectionCapabilitiesSchema.fields.contractVersions,
        }),
      },
    }),
    exposedCommands: aggregateExposedCommandsTable,
    commandResolutions: makeTable({
      name: 'commandResolutions',
      shape: {
        aggregateIndex: primitives.integer({
          primaryKey: true,
          references: {
            tableName: 'exposedCommands',
            columnName: 'aggregateIndex',
            relation: 'exposedCommand',
            inverse: 'commandResolution',
          },
        }),
        nodeId: primitives.text(),
        pushIndex: primitives.integer(),
        sessionName: primitives.text(),
        claims: primitives.json({ schema: resolution.claims }),
        failure: primitives.json({
          schema: resolution.failure,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'commandResolutions_node',
          columns: ['nodeId', 'pushIndex'],
          unique: true,
        },
      ],
    }),
  },
});

/** Retained public Agent history and the fixed Node Repo acknowledgement. */
export const aggregateAgentSessionChainDbConfig = makeDbConfig({
  tables: {
    nodeDeliveryAcknowledgement:
      agentNodeFanoutDbConfig.tables.nodeDeliveryAcknowledgement,
    exposedCommands: aggregateExposedCommandsTable,
  },
});
