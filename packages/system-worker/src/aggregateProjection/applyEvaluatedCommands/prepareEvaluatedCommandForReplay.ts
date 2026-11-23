import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { prepareBoundReplayAppliedOperation } from '@zerospin/core/contracts/prepareReplayAppliedOperation';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Schema from 'effect/Schema';

import {
  EvaluatedAggregateCommandSchema,
  type IEvaluatedAggregateCommand,
} from '../../AggregateVersionChain/evaluatedAggregateCommand.js';
import type { IAggregateProjectionKey } from '../resolveAggregateProjectionView.js';

/** Decode the source-owned release output and bind portable model operations to that release. */
export const prepareEvaluatedCommandForReplay = makeFn(
  'AggregateProjection.prepareEvaluatedCommandForReplay',
)(function* (props: {
  input: IEvaluatedAggregateCommand;
  aggregateRelease: IAnyAggregateRelease;
  key: IAggregateProjectionKey;
}) {
  const { aggregateRelease, key, input } = props;
  const evaluatedCommand = yield* Schema.decodeUnknownEffect(
    Schema.toType(EvaluatedAggregateCommandSchema),
  )(input, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'projection-command-invalid',
      prefix: 'Invalid evaluated command',
    }),
  );
  if (
    !Number.isSafeInteger(evaluatedCommand.aggregateIndex) ||
    evaluatedCommand.aggregateId !== key.aggregateId ||
    evaluatedCommand.aggregateName !== key.aggregateName ||
    aggregateRelease.version !== key.aggregateVersion ||
    aggregateRelease.name !== key.aggregateName
  ) {
    return yield* makeZerospinError('projection-command-invalid');
  }
  if (
    evaluatedCommand.outcome.result._tag !== 'Success' &&
    evaluatedCommand.operations.length > 0
  ) {
    return yield* makeZerospinError('projection-operation-invalid');
  }
  const modelOperations = [];
  let previousIndex = -1;
  for (const output of evaluatedCommand.operations) {
    if (output.operationIndex <= previousIndex) {
      return yield* makeZerospinError('projection-operation-invalid');
    }
    previousIndex = output.operationIndex;
    if (
      output.operationName === 'external' ||
      output.operationName === 'command'
    ) {
      continue;
    }
    const model = aggregateRelease.models[output.modelName];
    if (model === undefined || model.version !== output.modelVersion) {
      return yield* makeZerospinError('projection-operation-model-mismatch');
    }
    const operation = yield* prepareBoundReplayAppliedOperation({
      model,
      operation: output,
    });
    modelOperations.push({
      operation,
      appliedAt: evaluatedCommand.outcome.finalizedAt,
    });
  }
  return { evaluatedCommand, modelOperations };
});
