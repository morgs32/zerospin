import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

import {
  BackendTraceSchema,
  type IBackendTrace,
} from './BackendTraceSchema.js';

const BackendTraceErrorSchema = Schema.Struct({
  extra: Schema.Struct({ backendTrace: BackendTraceSchema }),
});

/** Read framework correlation without changing scoped business failures. */
export function getBackendTrace(error: unknown): IBackendTrace | null {
  if (typeof error === 'object' && error !== null && 'scope' in error) {
    return null;
  }
  const decoded = Schema.decodeUnknownResult(BackendTraceErrorSchema)(error);
  return Result.isSuccess(decoded) ? decoded.success.extra.backendTrace : null;
}
