import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

/** Fence deployment mutations against a Worker version override that did not apply. */
export function requireWorkerVersion(
  expectedVersionId: string | undefined,
  observedVersionId: string | undefined,
) {
  if (
    expectedVersionId === undefined ||
    expectedVersionId === observedVersionId
  ) {
    return Effect.void;
  }
  return makeZerospinError({
    code: 'zerospin-deployment-worker-version-mismatch',
    message:
      'Expected Worker version ' +
      expectedVersionId +
      ', but this request reached ' +
      (observedVersionId ?? 'a Worker without version metadata') +
      '.',
  });
}
