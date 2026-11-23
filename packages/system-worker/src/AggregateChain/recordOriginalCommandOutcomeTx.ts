import { CommandOutcomeSchema } from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import {
  EvaluatedAggregateCommandSchema,
  type IEvaluatedAggregateCommand,
} from '../AggregateVersionChain/evaluatedAggregateCommand.js';

import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';
import { readAdmittedAggregateCommand } from './readAdmittedAggregateCommand.js';

/** Retain the original outcome with complete pending command deliveries and external requests atomically. */
export function recordOriginalCommandOutcomeTx(
  db: IDb,
  indices: readonly number[],
  evaluatedCommands: readonly IEvaluatedAggregateCommand[],
  key: { aggregateId: string; aggregateName: string },
) {
  const decodedEvaluatedCommands = Schema.decodeUnknownSync(
    Schema.Array(Schema.toType(EvaluatedAggregateCommandSchema)),
  )(evaluatedCommands, { onExcessProperty: 'error' });
  const command = decodedEvaluatedCommands[0];
  if (
    indices.length !== 1 ||
    decodedEvaluatedCommands.length !== 1 ||
    command === undefined
  ) {
    throw makeZerospinError('aggregate-original-receipt-invalid');
  }
  db.transaction(tx => {
    const { commands, externalOperationOutbox, commandOperationOutbox } =
      aggregateChainDbConfig.schema;
    const progress = tx
      .select()
      .from(aggregateChainDbConfig.schema.commandProgress)
      .where(eq(aggregateChainDbConfig.schema.commandProgress.singleton, 1))
      .get();
    if (progress === undefined) {
      throw makeZerospinError('aggregate-command-progress-missing');
    }
    const row = tx
      .select()
      .from(commands)
      .where(eq(commands.aggregateIndex, indices[0]!))
      .get();
    if (
      row === undefined ||
      row.aggregateIndex !== command.aggregateIndex ||
      row.id !== command.id
    ) {
      throw makeZerospinError('aggregate-original-receipt-identity-mismatch');
    }
    const input = readAdmittedAggregateCommand(row, key);
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
      throw makeZerospinError('aggregate-original-receipt-identity-mismatch');
    }
    if (originalOutcome !== null) {
      if (!isEqual(originalOutcome, command.outcome)) {
        throw makeZerospinError('aggregate-original-output-mismatch');
      }
      return;
    }
    if (progress.finalizedThroughIndex !== command.aggregateIndex - 1) {
      throw makeZerospinError('aggregate-original-predecessor-pending');
    }
    if (
      command.payload === null &&
      (payloadFailure === undefined ||
        command.outcome.result._tag !== 'Failure' ||
        !isEqual(command.outcome.result.failure, payloadFailure))
    ) {
      throw makeZerospinError('aggregate-original-output-mismatch');
    }
    if (
      command.outcome.result._tag === 'Failure' &&
      command.operations.length !== 0
    ) {
      throw makeZerospinError('aggregate-original-output-invalid');
    }
    let previous = -1;
    for (const operation of command.operations) {
      if (
        !Number.isSafeInteger(operation.operationIndex) ||
        operation.operationIndex <= previous
      ) {
        throw makeZerospinError('aggregate-original-operation-index-invalid');
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
      .where(eq(commands.aggregateIndex, command.aggregateIndex))
      .run();
    tx.update(aggregateChainDbConfig.schema.commandProgress)
      .set({ finalizedThroughIndex: command.aggregateIndex })
      .where(eq(aggregateChainDbConfig.schema.commandProgress.singleton, 1))
      .run();
    for (const operation of command.operations) {
      if (operation.operationName === 'command') {
        tx.insert(commandOperationOutbox)
          .values(
            Schema.encodeSync(
              aggregateChainDbConfig.tables.commandOperationOutbox.codec,
            )({
              aggregateIndex: command.aggregateIndex,
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
            aggregateChainDbConfig.tables.externalOperationOutbox.codec,
          )({
            externalCommandId,
            externalContractName,
            externalContractVersion,
            payload,
            originCommandId: input.id,
            aggregateVersion: input.aggregateVersion,
            externalOutcome: null,
            continuationFailure: null,
          }),
        )
        .run();
    }
  });
}
