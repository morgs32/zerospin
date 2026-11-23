import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { frameworkExtra } from './frameworkExtra.js';
import type { IZerospinError } from './types.js';

export const ZerospinErrorJsonSchema = Schema.Struct({
  _tag: Schema.Literal('ZerospinError'),
  code: Schema.String,
  message: Schema.String,
  status: Schema.NullOr(Schema.Number),
  extra: Schema.NullOr(Schema.Record(Schema.String, Schema.Json)),
});
export type IZerospinErrorJson<CODE extends string = string> = Omit<
  typeof ZerospinErrorJsonSchema.Type,
  'code'
> & { readonly code: CODE };

const serializationFailure: IZerospinErrorJson<'error-serialization-failed'> = {
  _tag: 'ZerospinError',
  code: 'error-serialization-failed',
  message: 'The error could not be serialized.',
  status: null,
  extra: null,
};

export type IErrorJson<E> = E extends { toJson(): infer JSON }
  ? JSON | typeof serializationFailure
  : E extends Pick<
        IZerospinError<infer CODE>,
        '_tag' | 'code' | 'message' | 'status' | 'extra'
      >
    ? IZerospinErrorJson<CODE> | typeof serializationFailure
    : typeof serializationFailure;

/** Serialize typed failures only; defects and interruption remain in the caller's Cause. */
export function encodeError<E extends { toJson(): unknown }>(
  error: E,
): Effect.Effect<IErrorJson<E>>;
export function encodeError<
  E extends Pick<
    IZerospinErrorJson,
    '_tag' | 'code' | 'message' | 'status' | 'extra'
  >,
>(
  error: E,
): Effect.Effect<IZerospinErrorJson<E['code'] | 'error-serialization-failed'>>;
export function encodeError<E>(error: E): Effect.Effect<IErrorJson<E>>;
export function encodeError(error: unknown) {
  return Effect.try(() => {
    if (typeof error !== 'object' || error === null) {
      throw new Error('Expected a framework or scoped business error');
    }
    if ('scope' in error) {
      if (!('toJson' in error) || typeof error.toJson !== 'function') {
        throw new Error('A scoped business error requires its declared codec');
      }
      return Schema.decodeUnknownSync(Schema.Json)(error.toJson());
    }
    const decodedFrameworkError = Schema.decodeUnknownSync(
      Schema.Struct({
        ...ZerospinErrorJsonSchema.fields,
        extra: Schema.Unknown,
      }),
    )(
      'toJson' in error && typeof error.toJson === 'function'
        ? error.toJson()
        : error,
    );
    return Schema.decodeUnknownSync(ZerospinErrorJsonSchema)({
      _tag: 'ZerospinError' as const,
      code: decodedFrameworkError.code,
      message: decodedFrameworkError.message,
      status: decodedFrameworkError.status,
      extra: frameworkExtra(decodedFrameworkError.extra),
    });
  }).pipe(
    Effect.catch(cause =>
      Effect.logError('Error serialization failed', error, cause).pipe(
        Effect.as(serializationFailure),
      ),
    ),
  );
}
