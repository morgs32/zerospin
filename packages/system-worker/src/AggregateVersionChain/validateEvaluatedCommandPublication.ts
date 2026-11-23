import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { operationCodecs } from '@zerospin/core/contracts/operationCodecs';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IEvaluatedAggregateCommand } from './evaluatedAggregateCommand.js';

/** Validate the complete fresh suffix before any Archive can commit part of it. */
export const validateEvaluatedCommandPublication = Effect.fn(
  'AggregateVersionChain.validateEvaluatedCommandPublication',
)(function* (props: {
  commands: readonly IEvaluatedAggregateCommand[];
  aggregateRelease: IAnyAggregateRelease | undefined;
  publishedThrough: number;
}) {
  const { commands, aggregateRelease, publishedThrough } = props;
  if (commands.length > 64) {
    return yield* makeZerospinError('aggregate-publication-batch-too-large');
  }
  let tip = publishedThrough;
  for (const evaluatedCommand of commands) {
    if (
      evaluatedCommand.outcome.result._tag === 'Failure' &&
      evaluatedCommand.operations.length > 0
    ) {
      return yield* makeZerospinError(
        'aggregate-evaluated-command-operations-invalid',
      );
    }
    const emittedCommandIds = new Set<string>();
    let previous = -1;
    for (const operation of evaluatedCommand.operations) {
      if (operation.operationIndex <= previous) {
        return yield* makeZerospinError(
          'aggregate-evaluated-command-operations-invalid',
        );
      }
      previous = operation.operationIndex;
      if (operation.operationName === 'command') {
        if (emittedCommandIds.has(operation.command.command.id)) {
          return yield* makeZerospinError('command-operation-id-duplicate');
        }
        emittedCommandIds.add(operation.command.command.id);
        continue;
      }
      if (operation.operationName === 'external') {
        if (
          aggregateRelease === undefined ||
          emittedCommandIds.has(operation.externalCommandId)
        ) {
          return yield* makeZerospinError(
            'aggregate-evaluated-command-operations-invalid',
          );
        }
        emittedCommandIds.add(operation.externalCommandId);
        continue;
      }
      const model = aggregateRelease?.models[operation.modelName];
      if (model === undefined || model.version !== operation.modelVersion) {
        return yield* makeZerospinError(
          'aggregate-evaluated-command-model-invalid',
        );
      }
      const codecs = operationCodecs(model).operations;
      yield* Schema.decodeUnknownEffect(
        Schema.Union([
          codecs.create,
          codecs.update,
          codecs.delete,
          codecs.move,
        ]),
      )(
        {
          modelName: operation.modelName,
          modelVersion: operation.modelVersion,
          resourceId: operation.resourceId,
          operationName: operation.operationName,
          body: operation.body,
        },
        { onExcessProperty: 'error' },
      ).pipe(
        mapParseError({
          code: 'aggregate-evaluated-command-operations-invalid',
          prefix: 'Invalid model operation in evaluated command',
        }),
      );
    }
    if (evaluatedCommand.aggregateIndex !== tip + 1) {
      return yield* makeZerospinError('aggregate-commands-gap');
    }
    tip = evaluatedCommand.aggregateIndex;
  }
});
