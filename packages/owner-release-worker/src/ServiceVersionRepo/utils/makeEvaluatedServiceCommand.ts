import { mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { advanceDispositionChainHash } from '@zerospin/system-worker/serviceDispositionChainHash/serviceDispositionChainHash';
import { EvaluatedServiceCommandSchema } from '@zerospin/system-worker/ServiceVersionChain/evaluatedServiceCommand';
import type { Success } from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { executeServiceOccurrence } from './executeServiceOccurrence.js';
import type { readServiceOccurrenceTx } from './readServiceOccurrenceTx.js';

/** Finalize the occurrence from its committed success or rolled-back public refusal. */
export const makeEvaluatedServiceCommand = makeFn(
  'ServiceVersionRepo.makeEvaluatedServiceCommand',
)(function* (
  occurrence: NonNullable<Success<ReturnType<typeof readServiceOccurrenceTx>>>,
  execution: Success<ReturnType<typeof executeServiceOccurrence>>,
) {
  const { command, finalizedAt } = occurrence;
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
      occurrence.materializationHead.dispositionChainHash,
    serviceIndex: command.serviceIndex,
    commandId: command.id,
  });
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(EvaluatedServiceCommandSchema),
  )({
    ...command,
    dispositionChainHash,
    outcome,
    operations: execution.kind === 'success' ? execution.operations : [],
  }).pipe(
    mapParseError({
      code: 'service-final-command-invalid',
      prefix: 'Invalid evaluated Service command',
    }),
  );
});
