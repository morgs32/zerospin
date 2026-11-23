import { expectTypeOf } from '@effect/vitest';
import { encodeError, ZerospinError } from '@zerospin/error';
import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** Compile only: public construction and encoding keep declared diagnostics. */
export function frameworkErrorTypeExamples() {
  const TimeoutError = ZerospinError.schema({
    code: 'test-timeout',
    message: 'Backend is not responding.',
    extra: Schema.Struct({ timeoutMs: Schema.Number }),
  });
  const failure = TimeoutError.make({ extra: { timeoutMs: 10_000 } });
  expectTypeOf(failure.code).toEqualTypeOf<'test-timeout'>();
  expectTypeOf(failure.extra).toEqualTypeOf<Readonly<{ timeoutMs: number }>>();
  expectTypeOf(failure.toJson().extra).toEqualTypeOf<
    Readonly<{ timeoutMs: number }>
  >();
  // @ts-expect-error A declared non-null diagnostic is required.
  TimeoutError.make();
  // @ts-expect-error Diagnostics are required even when options are supplied.
  TimeoutError.make({ message: 'Unavailable.' });
  // @ts-expect-error Diagnostics retain their declared value types.
  TimeoutError.make({ extra: { timeoutMs: 'ten seconds' } });
  // @ts-expect-error Framework errors carry no business scope.
  void failure.scope;
  // @ts-expect-error Private causes are absent from the public envelope.
  void failure.toJson().cause;
  const encoded = encodeError(failure);
  type IEncoded = Effect.Success<typeof encoded>;
  expectTypeOf<
    Extract<IEncoded, { code: 'test-timeout' }>['extra']
  >().toEqualTypeOf<Readonly<{ timeoutMs: number }>>();
  expectTypeOf<
    Extract<IEncoded, { code: 'error-serialization-failed' }>['code']
  >().toEqualTypeOf<'error-serialization-failed'>();
}
