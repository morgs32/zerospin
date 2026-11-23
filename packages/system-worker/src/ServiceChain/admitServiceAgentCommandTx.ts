import { EncodedAgentServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';

import {
  acknowledgeAgentNodeCommand,
  readActiveProducerPosition,
} from '../agentNodeProducer/agentNodeProducerPosition.js';
import { checkAdmissionGrant } from '../ownerOperations/admissionGrant.js';
import { readExecutingSystemSpec } from '../workerConfiguration/workerConfiguration.js';

import { appendServiceCommand } from './admitServiceCommands/appendServiceCommand.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';

/** Fence every admission and duplicate acknowledgement to its active installation. */
export const admitServiceAgentCommandTx = makeTx(
  'ServiceChain.admitFromServiceAgentNode',
)(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  props: {
    key: { systemId: string; serviceName: string };
    source: { systemId: string; serviceName: string; agentName: string };
    generation: number;
    producerIndex: number;
    command: typeof EncodedAgentServiceCommandSchema.Type;
  },
  registered?: ISystemSpec,
) {
  const source = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      systemId: Schema.NonEmptyString,
      serviceName: Schema.NonEmptyString,
      agentName: Schema.NonEmptyString,
    }),
  )(props.source, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-command-producer-invalid',
      prefix: 'Invalid Service Agent Node producer',
    }),
  );
  const producerIndex = yield* Schema.decodeUnknownEffect(
    Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThan(0),
      Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
    ),
  )(props.producerIndex).pipe(
    mapParseError({
      code: 'service-command-producer-invalid',
      prefix: 'Invalid Agent producer position',
    }),
  );
  if (
    source.systemId !== props.key.systemId ||
    source.serviceName !== props.key.serviceName
  ) {
    return yield* makeZerospinError('service-command-producer-mismatch');
  }
  const { generation } = props;
  const lastProducerIndex = yield* readActiveProducerPosition(
    tx,
    source.agentName,
    generation,
  );
  if (producerIndex <= lastProducerIndex) {
    return { generation, acknowledgedProducerIndex: lastProducerIndex };
  }
  if (producerIndex !== lastProducerIndex + 1) {
    return yield* makeZerospinError('service-agent-producer-index-mismatch');
  }
  const command = yield* Schema.decodeUnknownEffect(
    EncodedAgentServiceCommandSchema,
  )(props.command, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-produced-command-invalid',
      prefix: 'Invalid Agent Service command',
    }),
  );
  if (
    command.serviceName !== source.serviceName ||
    command.agentName !== source.agentName
  ) {
    return yield* makeZerospinError('service-command-producer-mismatch');
  }
  yield* checkAdmissionGrant(command, registered ?? readExecutingSystemSpec());
  yield* appendServiceCommand(tx, command);
  acknowledgeAgentNodeCommand(tx, source.agentName, producerIndex);
  return { generation, acknowledgedProducerIndex: producerIndex };
});

// The receipt table is outside command history compaction.
export const admitHostedServiceAgentCommandTx = makeTx(
  'ServiceChain.admitHostedServiceAgentCommand',
)(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  command: typeof EncodedAgentServiceCommandSchema.Type,
  append: boolean,
) {
  const table = serviceChainDbConfig.schema.agentCommandReceipts;
  const {
    id: commandId,
    kind: _kind,
    serviceName: _serviceName,
    ...commandFields
  } = command;
  const row = tx
    .select()
    .from(table)
    .where(eq(table.commandId, commandId))
    .get();
  if (row !== undefined) {
    if (
      row.commandName !== commandFields.commandName ||
      row.payload !== commandFields.payload ||
      row.contractVersion !== commandFields.contractVersion ||
      row.serviceVersion !== commandFields.serviceVersion ||
      row.agentName !== commandFields.agentName ||
      row.agentVersion !== commandFields.agentVersion
    ) {
      return yield* makeZerospinError('service-agent-command-conflict');
    }
    return { commandId, serviceIndex: row.serviceIndex };
  }
  if (!append) return null;
  const { serviceIndex } = yield* appendServiceCommand(tx, command);
  tx.insert(table)
    .values({ ...commandFields, commandId, serviceIndex })
    .run();
  return { commandId, serviceIndex };
});
