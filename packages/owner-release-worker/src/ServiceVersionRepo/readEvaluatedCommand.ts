import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { findEvaluatedCommand } from './findEvaluatedCommand.js';

/** Committed progress requires complete pending publication or immutable history. */
export const readEvaluatedCommand = Effect.fn(
  'ServiceVersionRepo.readEvaluatedCommand',
)(function* (props: Parameters<typeof findEvaluatedCommand>[0]) {
  const retained = yield* findEvaluatedCommand(props);
  if (retained === null) {
    return yield* makeZerospinError('service-committed-result-missing');
  }
  return retained;
});
