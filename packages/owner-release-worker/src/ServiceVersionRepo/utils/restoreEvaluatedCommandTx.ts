import { applyOperationTx } from '@zerospin/core/contracts/applyOperationTx';
import { prepareReplayAppliedOperation } from '@zerospin/core/contracts/prepareReplayAppliedOperation';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { advanceDispositionChainHash } from '@zerospin/system-worker/serviceDispositionChainHash/serviceDispositionChainHash';
import type { IEvaluatedServiceCommand } from '@zerospin/system-worker/ServiceVersionChain/evaluatedServiceCommand';
import type { Effect } from 'effect';

import type { readServiceOccurrenceTx } from './readServiceOccurrenceTx.js';
import type { resolveServiceExecution } from './resolveServiceExecution.js';
import { retainEvaluatedCommandTx } from './retainEvaluatedCommandTx.js';

/** Restore this release's immutable model output without repeating outgoing work. */
export const restoreEvaluatedCommandTx = makeFn(
  'ServiceVersionRepo.restoreEvaluatedCommandTx',
)(function* (
  tx: Parameters<typeof readServiceOccurrenceTx>[0],
  props: {
    occurrence: NonNullable<
      Effect.Success<ReturnType<typeof readServiceOccurrenceTx>>
    >;
    serviceRelease: Parameters<typeof resolveServiceExecution>[1];
    retainedCommand: IEvaluatedServiceCommand;
  },
) {
  const { occurrence, serviceRelease, retainedCommand } = props;
  const { command, materializationHead } = occurrence;
  if (
    retainedCommand.serviceIndex !== command.serviceIndex ||
    retainedCommand.id !== command.id ||
    retainedCommand.dispositionChainHash !==
      advanceDispositionChainHash({
        previousDispositionChainHash: materializationHead.dispositionChainHash,
        serviceIndex: command.serviceIndex,
        commandId: command.id,
        outcome: retainedCommand.outcome,
      })
  ) {
    return yield* makeZerospinError('service-replay-history-mismatch');
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
        controller: serviceRelease,
      }),
      appliedAt: retainedCommand.outcome.finalizedAt,
    });
  }
  return yield* retainEvaluatedCommandTx(tx, retainedCommand);
});
