import { CommandOutcomeSchema } from '@zerospin/core/contracts/CommandOutcomeSchema';
import { EncodedAgentServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { FailedContinuationPayloadSchema } from '@zerospin/core/contracts/ContinuationPayloadSchema';
import { ExternalOutcomeSchema } from '@zerospin/core/contracts/ExternalOutcomeSchema';
import { RecordedCommandSchema } from '@zerospin/core/contracts/RecordedCommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { agentNodeProducerDbConfig } from '../agentNodeProducer/agentNodeProducerDbConfig.js';

export const serviceChainBaseline = makeDbConfig({
  tables: {
    admissionPosition: makeTable({
      name: 'admissionPosition',
      shape: {
        singleton: primitives.integer({ primaryKey: true }),
        lastIndex: primitives.integer(),
      },
    }),
    finalizedPosition: makeTable({
      name: 'finalizedPosition',
      shape: {
        singleton: primitives.integer({ primaryKey: true }),
        lastIndex: primitives.integer(),
        compactedThroughIndex: primitives.integer(),
      },
    }),
    ...agentNodeProducerDbConfig.tables,
    nodeProducers: makeTable({
      name: 'nodeProducers',
      shape: {
        nodeId: primitives.text({ primaryKey: true }),
        lastPushIndex: primitives.integer(),
        serviceVersion: primitives.integer(),
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
        id: primitives.text({ unique: true }),
        commandName: primitives.text(),
        payload: primitives.text({ nullable: true }),
        payloadFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
        contractVersion: primitives.integer(),
        serviceVersion: primitives.integer(),
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
        serviceIndex: primitives.integer({ primaryKey: true }),
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
        serviceIndex: primitives.integer(),
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
          columns: ['serviceIndex', 'operationIndex'],
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
        serviceVersion: primitives.integer(),
        externalOutcome: primitives.json({
          schema: ExternalOutcomeSchema,
          nullable: true,
        }),
      },
    }),
    replaySubscribers: makeTable({
      name: 'replaySubscribers',
      shape: {
        serviceVersion: primitives.integer({ primaryKey: true }),
        acknowledgedServiceIndex: primitives.integer(),
        initializationThroughIndex: primitives.integer(),
      },
    }),
  },
});

export const serviceChainWithSerializedReceipts = makeDbConfig({
  tables: {
    ...serviceChainBaseline.tables,
    agentCommandReceipts: makeTable({
      name: 'agentCommandReceipts',
      shape: {
        commandId: primitives.text({ primaryKey: true }),
        command: primitives.json({ schema: EncodedAgentServiceCommandSchema }),
        serviceIndex: primitives.integer(),
      },
    }),
  },
});

export const serviceChainDbConfig = makeDbConfig({
  tables: {
    ...serviceChainBaseline.tables,
    agentCommandReceipts: makeTable({
      name: 'agentCommandReceipts',
      shape: {
        commandId: primitives.text({ primaryKey: true }),
        commandName: primitives.text(),
        payload: primitives.text(),
        contractVersion: primitives.integer(),
        serviceVersion: primitives.integer(),
        agentName: primitives.text(),
        agentVersion: primitives.integer(),
        serviceIndex: primitives.integer(),
      },
    }),
  },
});
