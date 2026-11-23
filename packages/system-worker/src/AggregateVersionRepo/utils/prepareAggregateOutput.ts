import { isAggregateExternalContractDefinition } from '@zerospin/core/contracts/defineAggregateExternalContract';
import { prepareCommandOperation } from '@zerospin/core/contracts/prepareCommandOperation';
import type { IContractOutput } from '@zerospin/core/contracts/types';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { Effect } from 'effect';

import { prepareAggregateExternalOperation } from '../../externalOperations/prepareExternalOperation.js';

import type { readAggregateCommandTx } from './readAggregateCommandTx.js';
import type { resolveAggregateExecution } from './resolveAggregateExecution.js';

/** Preserve authored model indexes and freeze outgoing commands and external work only for original execution. */
export const prepareAggregateOutput = makeFn(
  'AggregateVersionRepo.prepareAggregateOutput',
)(function* (
  operations: readonly IContractOutput[],
  commandContext: NonNullable<
    Effect.Success<ReturnType<typeof readAggregateCommandTx>>
  >,
  executionAggregateRelease: Parameters<typeof resolveAggregateExecution>[1],
  mode: 'original' | 'replay',
  operationIndexOffset = 0,
  extension?: true,
) {
  const { command } = commandContext;
  const output = [];
  for (const [index, operation] of operations.entries()) {
    const operationIndex = operationIndexOffset + index;
    if (operation.operationName === 'command') {
      if (mode === 'replay') continue;
      const recordedCommand = yield* prepareCommandOperation({
        operation,
        sourceRelease: executionAggregateRelease,
        declaration: {
          commandName: command.commandName,
          ...(extension ? { extension } : {}),
        },
      });
      output.push({
        kind: 'command' as const,
        command: recordedCommand,
        operationIndex,
      });
      continue;
    }
    if (operation.operationName !== 'external') {
      output.push({ kind: 'model' as const, operation, operationIndex });
      continue;
    }
    if (mode === 'replay') continue;
    if (!isAggregateExternalContractDefinition(operation.contract)) {
      return yield* makeZerospinError('external-emission-unregistered');
    }
    const row = yield* prepareAggregateExternalOperation({
      initiatingCommandId: command.id,
      operationIndex,
      aggregateRelease: executionAggregateRelease,
      operation: { ...operation, contract: operation.contract },
    });
    output.push({
      kind: 'external' as const,
      row,
      operationIndex,
    });
  }
  return output;
});
