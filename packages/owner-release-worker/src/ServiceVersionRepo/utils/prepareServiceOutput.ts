import { isServiceExternalContractDefinition } from '@zerospin/core/contracts/defineServiceExternalContract';
import { prepareCommandOperation } from '@zerospin/core/contracts/prepareCommandOperation';
import type { IContractOutput } from '@zerospin/core/contracts/types';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { prepareServiceExternalOperation } from '@zerospin/system-worker/externalOperations/prepareExternalOperation';
import type { Effect } from 'effect';

import type { readServiceOccurrenceTx } from './readServiceOccurrenceTx.js';
import type { resolveServiceExecution } from './resolveServiceExecution.js';

/** Preserve authored model indexes and freeze outgoing commands and external work only for original execution. */
export const prepareServiceOutput = makeFn(
  'ServiceVersionRepo.prepareServiceOutput',
)(function* (
  operations: readonly IContractOutput[],
  occurrence: NonNullable<
    Effect.Success<ReturnType<typeof readServiceOccurrenceTx>>
  >,
  executionRelease: Parameters<typeof resolveServiceExecution>[1],
  mode: 'original' | 'replay',
  extensionStartIndex?: number,
) {
  const { command } = occurrence;
  const output = [];
  for (const [index, operation] of operations.entries()) {
    const operationIndex = (extensionStartIndex ?? 0) + index;
    if (operation.operationName === 'command') {
      if (mode === 'replay') continue;
      const recordedCommand = yield* prepareCommandOperation({
        operation,
        sourceRelease: executionRelease,
        declaration: {
          commandName: command.commandName,
          ...(extensionStartIndex === undefined
            ? {}
            : { extension: true as const }),
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
    if (!isServiceExternalContractDefinition(operation.contract)) {
      return yield* makeZerospinError('external-emission-unregistered');
    }
    const row = yield* prepareServiceExternalOperation({
      initiatingCommandId: command.id,
      operationIndex,
      serviceRelease: executionRelease,
      operation: { ...operation, contract: operation.contract },
    });
    output.push({ kind: 'external' as const, row, operationIndex });
  }
  return output;
});
