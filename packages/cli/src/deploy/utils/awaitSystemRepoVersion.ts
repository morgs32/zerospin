import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';

import type { ICandidateDeployment } from './deploymentTypes.js';

/** A promoted HTTP Worker does not attest its already-assigned SystemRepo. */
export const awaitSystemRepoVersion = makeFn('awaitSystemRepoVersion')(
  function* <E>(
    systemApi: {
      getExecutingWorkerVersion: () => Effect.Effect<string | null, E>;
    },
    candidate: Pick<ICandidateDeployment, 'workerName' | 'versionId'>,
  ) {
    for (;;) {
      const executingVersion = yield* systemApi
        .getExecutingWorkerVersion()
        .pipe(
          Effect.catchCause(cause => {
            // Cap'n Web rejects unavailable methods with this exact TypeError. It is
            // pending only during the post-promotion assignment window; other RPC,
            // authentication, defect and interruption failures retain their Cause.
            const reason = cause.reasons[0];
            if (
              cause.reasons.length === 1 &&
              reason &&
              Cause.isDieReason(reason) &&
              reason.defect instanceof TypeError &&
              /^'[^']*getExecutingWorkerVersion' is not a function\.$/.test(
                reason.defect.message,
              )
            ) {
              return Effect.succeed(null);
            }
            return Effect.failCause(cause);
          }),
        );
      if (executingVersion === candidate.versionId) return;
      yield* Effect.sleep('1 second');
    }
  },
  Effect.timeout('180 seconds'),
  Effect.mapError(cause =>
    Cause.isTimeoutError(cause)
      ? makeZerospinError({
          code: 'zerospin-deployment-version-assignment-pending',
          message:
            'The promoted SystemRepo did not attest its executing Worker version before initialization.',
          cause: prettyUnknownFailure(cause),
        })
      : cause,
  ),
);
