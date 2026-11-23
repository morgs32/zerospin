import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { encodeOperation } from '@zerospin/core/contracts/encodeAppliedOperation';
import { makeFn } from '@zerospin/logger';
import type * as Effect from 'effect/Effect';
import * as Struct from 'effect/Struct';

import type { IEvaluatedAggregateOperation } from '../../AggregateVersionChain/evaluatedAggregateCommand.js';

import type { prepareAggregateOutput } from './prepareAggregateOutput.js';
import type { readAggregateCommandTx } from './readAggregateCommandTx.js';

/** Apply and retain prepared operations in authored order within the business savepoint. */
export const applyAggregateOperationsTx = makeFn(
  'AggregateVersionRepo.applyAggregateOperationsTx',
)(function* (
  tx: Parameters<typeof readAggregateCommandTx>[0],
  output: Effect.Success<ReturnType<typeof prepareAggregateOutput>>,
  commandContext: NonNullable<
    Effect.Success<ReturnType<typeof readAggregateCommandTx>>
  >,
) {
  const { command, finalizedAt } = commandContext;
  const operations: IEvaluatedAggregateOperation[] = [];
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
        ...Struct.omit(prepared.row, [
          'initiatingCommandId',
          'aggregateVersion',
        ]),
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
