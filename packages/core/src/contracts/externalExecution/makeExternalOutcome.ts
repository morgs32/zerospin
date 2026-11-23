import type { Exit, Schema } from 'effect';

import type { IExternalOutcome } from '../ExternalOutcomeSchema.ts';

/** Record a usable response or terminal request failure at one observation time. */
export function makeExternalOutcome(
  requestExit: Exit.Exit<typeof Schema.Json.Type, unknown>,
  recordedAt: Date,
): IExternalOutcome {
  return requestExit._tag === 'Success'
    ? { _tag: 'Success', success: requestExit.value, recordedAt }
    : {
        _tag: 'Failure',
        failure: {
          _tag: 'ExternalRequestFailure',
          code: 'external-request-failed',
          message: 'External request ended without a usable response',
        },
        recordedAt,
      };
}
