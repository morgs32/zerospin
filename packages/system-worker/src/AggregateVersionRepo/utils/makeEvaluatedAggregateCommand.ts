import { mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { Success } from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { advanceDispositionChainHash } from '../../aggregateDispositionChainHash/aggregateDispositionChainHash.js';
import { EvaluatedAggregateCommandSchema } from '../../AggregateVersionChain/evaluatedAggregateCommand.js';

import type { executeAggregateCommandTx } from './executeAggregateCommandTx.js';
import type { readAggregateCommandTx } from './readAggregateCommandTx.js';

/** Finalize the admitted command from its committed success or rolled-back public refusal. */
export const makeEvaluatedAggregateCommand = makeFn(
  'AggregateVersionRepo.makeEvaluatedAggregateCommand',
)(function* (
  commandContext: NonNullable<
    Success<ReturnType<typeof readAggregateCommandTx>>
  >,
  execution: Success<ReturnType<typeof executeAggregateCommandTx>>,
) {
  const { command, finalizedAt } = commandContext;
  const outcome = {
    result:
      execution.kind === 'failure'
        ? { _tag: 'Failure' as const, failure: execution.failure }
        : { _tag: 'Success' as const, success: execution.result },
    finalizedAt,
  };
  const dispositionChainHash = advanceDispositionChainHash({
    outcome,
    previousDispositionChainHash:
      commandContext.materializationHead.dispositionChainHash,
    aggregateIndex: command.aggregateIndex,
    commandId: command.id,
  });
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(EvaluatedAggregateCommandSchema),
  )({
    ...command,
    dispositionChainHash,
    outcome,
    operations: execution.kind === 'success' ? execution.operations : [],
  }).pipe(
    mapParseError({
      code: 'aggregate-final-command-invalid',
      prefix: 'Invalid evaluated command',
    }),
  );
});
