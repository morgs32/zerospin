import { CommandOutcomeSchema } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import {
  EvaluatedServiceCommandSchema,
  type IEvaluatedServiceCommand,
} from '../ServiceVersionChain/evaluatedServiceCommand.js';

import { readServiceCommandOccurrence } from './readServiceCommandOccurrence.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';

/** Retain the original outcome with complete pending command deliveries and external requests atomically. */
export function recordOriginalCommandOutcomeTx(
  db: IDb,
  indices: readonly number[],
  evaluatedCommands: readonly IEvaluatedServiceCommand[],
  key: { serviceName: string },
) {
  const decodedEvaluatedCommands = Schema.decodeUnknownSync(
    Schema.Array(Schema.toType(EvaluatedServiceCommandSchema)),
  )(evaluatedCommands, { onExcessProperty: 'error' });
  const command = decodedEvaluatedCommands[0];
  if (
    indices.length !== 1 ||
    decodedEvaluatedCommands.length !== 1 ||
    command === undefined
  ) {
    throw makeZerospinError('service-original-receipt-invalid');
  }
  db.transaction(tx => {
    const { commands, externalOperationOutbox, commandOperationOutbox } =
      serviceChainDbConfig.schema;
    const row = tx
      .select()
      .from(commands)
      .where(eq(commands.serviceIndex, indices[0]!))
      .get();
    if (
      row === undefined ||
      row.serviceIndex !== command.serviceIndex ||
      row.id !== command.id
    ) {
      throw makeZerospinError('service-original-receipt-identity-mismatch');
    }
    const input = readServiceCommandOccurrence(row, key);
    const {
      outcome: originalOutcome,
      payloadFailure,
      ...admittedInput
    } = input;
    const {
      outcome: _evaluatedOutcome,
      operations: _operations,
      dispositionChainHash: _dispositionChainHash,
      ...evaluatedInput
    } = command;
    if (!isEqual(admittedInput, evaluatedInput)) {
      throw makeZerospinError('service-original-receipt-identity-mismatch');
    }
    if (originalOutcome !== null) {
      if (!isEqual(originalOutcome, command.outcome)) {
        throw makeZerospinError('service-original-output-mismatch');
      }
      return;
    }
    const finalizedThrough =
      tx.select().from(serviceChainDbConfig.schema.finalizedPosition).get()
        ?.lastIndex ?? 0;
    if (command.serviceIndex !== finalizedThrough + 1) {
      throw makeZerospinError('service-original-predecessor-pending');
    }
    if (
      command.payload === null &&
      (payloadFailure === undefined ||
        command.outcome.result._tag !== 'Failure' ||
        !isEqual(command.outcome.result.failure, payloadFailure))
    ) {
      throw makeZerospinError('service-original-output-mismatch');
    }
    if (
      command.outcome.result._tag === 'Failure' &&
      command.operations.length !== 0
    ) {
      throw makeZerospinError('service-original-output-invalid');
    }
    let previous = -1;
    for (const operation of command.operations) {
      if (
        !Number.isSafeInteger(operation.operationIndex) ||
        operation.operationIndex <= previous
      ) {
        throw makeZerospinError('service-original-operation-index-invalid');
      }
      previous = operation.operationIndex;
    }
    tx.update(commands)
      .set({
        payloadFailure: null,
        outcome: Schema.encodeSync(Schema.fromJsonString(CommandOutcomeSchema))(
          command.outcome,
        ),
      })
      .where(eq(commands.serviceIndex, command.serviceIndex))
      .run();
    tx.insert(serviceChainDbConfig.schema.finalizedPosition)
      .values({ singleton: 1, lastIndex: command.serviceIndex })
      .onConflictDoUpdate({
        target: serviceChainDbConfig.schema.finalizedPosition.singleton,
        set: { lastIndex: command.serviceIndex },
      })
      .run();
    for (const operation of command.operations) {
      if (operation.operationName === 'command') {
        tx.insert(commandOperationOutbox)
          .values(
            Schema.encodeSync(
              serviceChainDbConfig.tables.commandOperationOutbox.codec,
            )({
              serviceIndex: command.serviceIndex,
              operationIndex: operation.operationIndex,
              command: operation.command,
              destinationOutcome: null,
              continuationFailure: null,
            }),
          )
          .run();
        continue;
      }
      if (operation.operationName !== 'external') continue;
      const {
        externalCommandId,
        externalContractName,
        externalContractVersion,
        payload,
      } = operation;
      tx.insert(externalOperationOutbox)
        .values(
          Schema.encodeSync(
            serviceChainDbConfig.tables.externalOperationOutbox.codec,
          )({
            externalCommandId,
            externalContractName,
            externalContractVersion,
            payload,
            originCommandId: input.id,
            serviceVersion: input.serviceVersion,
            externalOutcome: null,
            continuationFailure: null,
          }),
        )
        .run();
    }
  });
}
