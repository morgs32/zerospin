import { prepareBoundReplayAppliedOperation } from '@zerospin/core/contracts/prepareReplayAppliedOperation';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Schema from 'effect/Schema';

import {
  EvaluatedServiceCommandSchema,
  type IEvaluatedServiceCommand,
} from '../ServiceVersionChain/evaluatedServiceCommand.js';

/** Decode the source-owned release output and bind portable model operations to that release. */
export const prepareServiceProjectionOccurrence = makeFn(
  'ServiceProjection.prepareServiceProjectionOccurrence',
)(function* (props: {
  input: IEvaluatedServiceCommand;
  serviceRelease: IAnyServiceRelease;
  key: { serviceName: string; serviceVersion: number };
}) {
  const { serviceRelease, key, input } = props;
  const command = yield* Schema.decodeUnknownEffect(
    Schema.toType(EvaluatedServiceCommandSchema),
  )(input, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'projection-command-invalid',
      prefix: 'Invalid evaluated command',
    }),
  );
  if (
    !Number.isSafeInteger(command.serviceIndex) ||
    serviceRelease.version !== key.serviceVersion ||
    serviceRelease.name !== key.serviceName ||
    command.serviceName !== key.serviceName
  ) {
    return yield* makeZerospinError('projection-command-invalid');
  }
  if (
    command.outcome.result._tag !== 'Success' &&
    command.operations.length > 0
  ) {
    return yield* makeZerospinError('projection-operation-invalid');
  }
  const operations = [];
  let previousIndex = -1;
  for (const output of command.operations) {
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
    const model = serviceRelease.models[output.modelName];
    if (model === undefined || model.version !== output.modelVersion) {
      return yield* makeZerospinError('projection-operation-model-mismatch');
    }
    const operation = yield* prepareBoundReplayAppliedOperation({
      model,
      operation: output,
    });
    operations.push({
      operation,
      operationIndex: output.operationIndex,
      appliedAt: command.outcome.finalizedAt,
    });
  }
  return { command, operations };
});
