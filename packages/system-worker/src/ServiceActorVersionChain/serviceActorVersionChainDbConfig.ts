import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { serviceExposedCommandsTable } from '../serviceProjection/serviceExposedCommandsTable.js';

import { ServiceConnectionCapabilitiesSchema } from './connectionCapabilities.js';

/** Immutable selected history and connection admissions; resources belong to ServiceActorVersionRepo. */
export const serviceActorVersionChainDbConfig = makeDbConfig({
  tables: {
    historyHead: makeTable({
      name: 'historyHead',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        serviceIndex: primitives.integer(),
        dispositionChainHash: primitives.text(),
      },
    }),
    archives: makeTable({
      name: 'archives',
      shape: { firstServiceIndex: primitives.integer({ primaryKey: true }) },
    }),
    archiveFanoutSubscribers: makeTable({
      name: 'archiveFanoutSubscribers',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        acknowledgedServiceIndex: primitives.integer(),
      },
    }),
    exposedCommands: serviceExposedCommandsTable,
    commandResolutions: makeTable({
      name: 'commandResolutions',
      shape: {
        serviceIndex: primitives.integer({
          primaryKey: true,
          references: {
            tableName: 'exposedCommands',
            columnName: 'serviceIndex',
            relation: 'exposedCommand',
            inverse: 'commandResolution',
          },
        }),
        nodeId: primitives.text(),
        pushIndex: primitives.integer(),
        sessionName: primitives.text(),
        claims: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
        }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'commandResolutions_node_push',
          columns: ['nodeId', 'pushIndex'],
          unique: true,
        },
      ],
    }),
    connectionLocks: makeTable({
      name: 'connectionLocks',
      shape: {
        connectionId: primitives.text({ primaryKey: true }),
        contractVersions: primitives.json({
          schema: ServiceConnectionCapabilitiesSchema.fields.contractVersions,
        }),
        modelNames: primitives.json({
          schema: ServiceConnectionCapabilitiesSchema.fields.modelNames,
        }),
      },
    }),
  },
});
