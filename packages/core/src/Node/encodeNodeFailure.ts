import {
  encodeError,
  ensureZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';

/** Normalize worker defects once; expose the existing public error fields only. */
export function encodeNodeFailure(
  code: string,
  failure: unknown,
): IZerospinErrorJson {
  const error = Cause.isCause(failure) ? Cause.squash(failure) : failure;
  return Effect.runSync(encodeError(ensureZerospinError({ code, error })));
}
