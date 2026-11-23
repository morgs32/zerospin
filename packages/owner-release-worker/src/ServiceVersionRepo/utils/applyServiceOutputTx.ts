import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { encodeOperation } from '@zerospin/core/contracts/encodeAppliedOperation';
import { makeFn } from '@zerospin/logger';
import type { IEvaluatedServiceOperation } from '@zerospin/system-worker/ServiceVersionChain/evaluatedServiceCommand';
import type * as Effect from 'effect/Effect';
import * as Struct from 'effect/Struct';

import type { prepareServiceOutput } from './prepareServiceOutput.js';
import type { readServiceOccurrenceTx } from './readServiceOccurrenceTx.js';

/** Apply and retain prepared operations in authored order within the business savepoint. */
export const applyServiceOutputTx = makeFn(
  'ServiceVersionRepo.applyServiceOutputTx',
)(function* (
  tx: Parameters<typeof readServiceOccurrenceTx>[0],
  output: Effect.Success<ReturnType<typeof prepareServiceOutput>>,
  occurrence: NonNullable<
    Effect.Success<ReturnType<typeof readServiceOccurrenceTx>>
  >,
) {
  const { command, finalizedAt } = occurrence;
  const operations: IEvaluatedServiceOperation[] = [];
  for (const prepared of output) {
    if (prepared.kind === 'command') {
      operations.push({
        operationName: 'command',
        operationIndex: prepared.operationIndex,
        command: prepared.command,
      });
      continue;
    }
    if (prepared.kind === 'external') {
      operations.push({
        ...Struct.omit(prepared.row, ['initiatingCommandId', 'serviceVersion']),
        operationName: 'external',
      });
      continue;
    }
    const { operation, operationIndex } = prepared;
    yield* applyOperationTx({
      tx,
      operation,
      appliedAt: finalizedAt,
    });
    const encoded = yield* encodeOperation({
      operation,
      commandId: command.id,
      operationIndex,
    });
    operations.push(Struct.omit(encoded, ['commandId']));
  }
  return { operations };
});
