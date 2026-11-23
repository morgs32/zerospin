import { describe, expect, expectTypeOf, it } from '@effect/vitest';
import {
  encodeError,
  matchZerospinErrorCode,
  recognizeZerospinError,
  ContractError,
  ZerospinError,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

const TimeoutError = ZerospinError.schema({
  code: 'test-backend-timeout',
  message: 'Backend is not responding.',
  extra: Schema.Struct({
    timeoutMs: Schema.Number.check(
      Schema.isFinite(),
      Schema.isInt(),
      Schema.isGreaterThan(0),
    ),
  }),
});
const UnavailableError = ZerospinError.schema({
  code: 'test-unavailable',
  message: 'No session is available.',
});
const FailureSchema = Schema.Union([TimeoutError, UnavailableError]);

describe('schema-backed framework errors', () => {
  it.effect(
    'preserves typed diagnostics through construction, codecs and public encoding',
    () =>
      Effect.gen(function* () {
        const failure = TimeoutError.make({
          cause: 'private backend cause',
          extra: { timeoutMs: 10_000 },
        });
        const wire = {
          _tag: 'ZerospinError',
          code: 'test-backend-timeout',
          message: 'Backend is not responding.',
          status: null,
          extra: { timeoutMs: 10_000 },
        };
        expect(failure.toJson()).toEqual(wire);
        expect(Schema.encodeSync(TimeoutError)(failure)).toEqual(wire);
        expect(Schema.decodeUnknownSync(TimeoutError)(wire).toJson()).toEqual(
          wire,
        );
        const encoded = yield* encodeError(failure);
        expect(encoded).toEqual(wire);
        if (encoded.code !== 'error-serialization-failed') {
          expectTypeOf(encoded.extra.timeoutMs).toEqualTypeOf<number>();
        }
        expect(UnavailableError.make().extra).toBeNull();
        expect(
          UnavailableError.make({ message: 'Session detached.' }).message,
        ).toBe('Session detached.');

        const recognized = recognizeZerospinError(FailureSchema, encoded);
        expect(
          matchZerospinErrorCode({
            failure: recognized,
            onMatch: {
              'test-backend-timeout': error => {
                expectTypeOf(error.extra.timeoutMs).toEqualTypeOf<number>();
                return error.extra.timeoutMs;
              },
            },
            onUnknown: () => -1,
          }),
        ).toBe(10_000);
      }),
  );

  it.effect(
    'rejects invalid diagnostics and never recognizes malformed known wire failures',
    () =>
      Effect.sync(() => {
        expect(() => Reflect.apply(TimeoutError.make, undefined, [])).toThrow();
        expect(() =>
          Reflect.apply(TimeoutError.make, undefined, [
            { extra: { timeoutMs: 'ten seconds' } },
          ]),
        ).toThrow();
        const malformed = {
          ...TimeoutError.make({ extra: { timeoutMs: 10_000 } }).toJson(),
          extra: { timeoutMs: -1 },
        };
        expect(
          Result.isFailure(Schema.decodeUnknownResult(TimeoutError)(malformed)),
        ).toBe(true);
        expect(
          matchZerospinErrorCode({
            failure: recognizeZerospinError(FailureSchema, malformed),
            onMatch: { 'test-backend-timeout': () => 'recognized' },
            onUnknown: () => 'unknown',
          }),
        ).toBe('unknown');
      }),
  );

  it.effect(
    'redacts framework diagnostics, rejects unsafe JSON and preserves scoped codecs',
    () =>
      Effect.gen(function* () {
        const ContextError = ZerospinError.schema({
          code: 'test-context',
          extra: Schema.Struct({
            context: Schema.Record(Schema.String, Schema.Json),
          }),
        });
        const failure = ContextError.make({
          cause: 'private cause',
          extra: {
            context: {
              detail: 'safe',
              nested: { cause: 'secret', stack: 'secret', detail: 'retained' },
            },
          },
        });
        const encoded = yield* encodeError(failure);
        expect(encoded).toEqual({
          _tag: 'ZerospinError',
          code: 'test-context',
          message: 'test-context',
          status: null,
          extra: {
            context: { detail: 'safe', nested: { detail: 'retained' } },
          },
        });
        expect(failure.toJson()).toEqual(encoded);

        const UnsafeError = ZerospinError.schema({
          code: 'test-unsafe',
          extra: Schema.Struct({ value: Schema.Unknown }),
        });
        expect(
          (yield* encodeError(
            UnsafeError.make({ extra: { value: new Date() } }),
          )).code,
        ).toBe('error-serialization-failed');

        const MissingError = ContractError.schema({
          code: 'test-missing',
          extra: Schema.Struct({ id: Schema.String }),
        });
        const scoped = MissingError.make({ extra: { id: 'row_one' } });
        expect(yield* encodeError(scoped)).toEqual(scoped.toJson());
        expect(
          Schema.decodeUnknownSync(MissingError)(scoped.toJson()).scope,
        ).toBe('contract');
      }),
  );
});
