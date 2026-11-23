import { CommandOutcomeSchema } from '@zerospin/core/contracts/CommandOutcomeSchema';
import { FailedContinuationPayloadSchema } from '@zerospin/core/contracts/ContinuationPayloadSchema';
import { ExternalOutcomeSchema } from '@zerospin/core/contracts/ExternalOutcomeSchema';
import { RecordedCommandSchema } from '@zerospin/core/contracts/RecordedCommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { agentNodeProducerDbConfig } from '../agentNodeProducer/agentNodeProducerDbConfig.js';

export const aggregateChainDbConfig = makeDbConfig({
  tables: {
    commandProgress: makeTable({
      name: 'commandProgress',
      shape: {
        singleton: primitives.integer({ primaryKey: true }),
        admittedThroughIndex: primitives.integer(),
        finalizedThroughIndex: primitives.integer(),
        compactedThroughIndex: primitives.integer(),
      },
    }),
    ...agentNodeProducerDbConfig.tables,
    nodeProducers: makeTable({
      name: 'nodeProducers',
      shape: {
        nodeId: primitives.text({ primaryKey: true }),
        lastPushIndex: primitives.integer(),
        aggregateVersion: primitives.integer(),
        sessionName: primitives.text(),
        actorName: primitives.text(),
        actorVersion: primitives.integer(),
        claims: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
        }),
      },
    }),
    commands: makeTable({
      name: 'commands',
      shape: {
        id: primitives.text(),
        commandName: primitives.text(),
        payload: primitives.text({ nullable: true }),
        payloadFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
        contractVersion: primitives.integer(),
        aggregateVersion: primitives.integer(),
        nodeId: primitives.text({ nullable: true }),
        kind: primitives.enum({ values: ['actor', 'agent', 'system'] }),
        actorName: primitives.text({ nullable: true }),
        actorVersion: primitives.integer({ nullable: true }),
        claims: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
          nullable: true,
        }),
        agentName: primitives.text({ nullable: true }),
        agentVersion: primitives.integer({ nullable: true }),
        sessionName: primitives.text({ nullable: true }),
        pushIndex: primitives.integer({ nullable: true }),
        aggregateIndex: primitives.integer({ primaryKey: true }),
        outcome: primitives.json({
          schema: CommandOutcomeSchema,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'commands_node',
          columns: ['nodeId', 'pushIndex'],
          unique: true,
        },
      ],
    }),
    recordedCommandAdmissions: makeTable({
      name: 'recordedCommandAdmissions',
      shape: {
        commandId: primitives.text({ primaryKey: true }),
        source: primitives.text(),
        sourceIndex: primitives.integer(),
        operationIndex: primitives.integer(),
        command: primitives.json({ schema: Schema.Json }),
        destinationIndex: primitives.integer(),
      },
      indexes: [
        {
          name: 'recorded_command_source_position',
          columns: ['source', 'sourceIndex', 'operationIndex'],
          unique: true,
        },
      ],
    }),
    commandOperationOutbox: makeTable({
      name: 'commandOperationOutbox',
      shape: {
        aggregateIndex: primitives.integer(),
        operationIndex: primitives.integer(),
        command: primitives.json({ schema: RecordedCommandSchema }),
        destinationOutcome: primitives.json({
          schema: CommandOutcomeSchema,
          nullable: true,
        }),
        continuationFailure: primitives.json({
          schema: FailedContinuationPayloadSchema,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'command_operation_order',
          columns: ['aggregateIndex', 'operationIndex'],
          unique: true,
        },
      ],
    }),
    externalOperationOutbox: makeTable({
      name: 'externalOperationOutbox',
      shape: {
        externalContractName: primitives.text(),
        continuationFailure: primitives.json({
          schema: FailedContinuationPayloadSchema,
          nullable: true,
        }),
        externalContractVersion: primitives.integer(),
        payload: primitives.json({ schema: Schema.Json }),
        externalCommandId: primitives.id({
          abbreviation: 'cmd',
          unique: true,
        }),
        originCommandId: primitives.text(),
        aggregateVersion: primitives.integer(),
        externalOutcome: primitives.json({
          schema: ExternalOutcomeSchema,
          nullable: true,
        }),
      },
    }),
    replaySubscribers: makeTable({
      name: 'replaySubscribers',
      shape: {
        aggregateVersion: primitives.integer({ primaryKey: true }),
        initializationThroughIndex: primitives.integer(),
        acknowledgedAggregateIndex: primitives.integer(),
      },
    }),
  },
});
