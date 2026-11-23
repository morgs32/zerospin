import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { prepareReplayAppliedOperation } from '@zerospin/core/contracts/prepareReplayAppliedOperation';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { Effect } from 'effect';

import { advanceDispositionChainHash } from '../../aggregateDispositionChainHash/aggregateDispositionChainHash.js';
import type { IEvaluatedAggregateCommand } from '../../AggregateVersionChain/evaluatedAggregateCommand.js';

import type { readAggregateCommandTx } from './readAggregateCommandTx.js';
import type { resolveAggregateExecution } from './resolveAggregateExecution.js';
import { retainEvaluatedCommandTx } from './retainEvaluatedCommandTx.js';

/** Restore this release's immutable model output and republish the identical complete command. */
export const restoreEvaluatedCommandTx = makeFn(
  'AggregateVersionRepo.restoreEvaluatedCommandTx',
)(function* (
  tx: Parameters<typeof readAggregateCommandTx>[0],
  props: {
    commandContext: NonNullable<
      Effect.Success<ReturnType<typeof readAggregateCommandTx>>
    >;
    aggregateRelease: Parameters<typeof resolveAggregateExecution>[1];
    retainedCommand: IEvaluatedAggregateCommand;
  },
) {
  const { commandContext, aggregateRelease, retainedCommand } = props;
  const { command, materializationHead } = commandContext;
  if (
    retainedCommand.aggregateIndex !== command.aggregateIndex ||
    retainedCommand.id !== command.id ||
    retainedCommand.dispositionChainHash !==
      advanceDispositionChainHash({
        previousDispositionChainHash: materializationHead.dispositionChainHash,
        aggregateIndex: command.aggregateIndex,
        commandId: command.id,
        outcome: retainedCommand.outcome,
      })
  ) {
    return yield* makeZerospinError('aggregate-replay-history-mismatch');
  }
  for (const operation of retainedCommand.operations) {
    if (
      operation.operationName === 'external' ||
      operation.operationName === 'command'
    ) {
      continue;
    }
    const { operationIndex: _operationIndex, ...encodedOperation } = operation;
    yield* applyOperationTx({
      tx,
      operation: yield* prepareReplayAppliedOperation({
        operation: encodedOperation,
        controller: aggregateRelease,
      }),
      appliedAt: retainedCommand.outcome.finalizedAt,
    });
  }
  return yield* retainEvaluatedCommandTx(tx, retainedCommand);
});
