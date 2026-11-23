import { makeZerospinError, type IZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

export const getByKeyOrThrow = Effect.fn('getByKeyOrThrow')(function* <
  RECORD extends Record<string, unknown>,
  KEY extends keyof RECORD & (string | number),
  const KIND extends string,
>(props: {
  record: RECORD;
  /** Literal keys preserve narrow return types; string and number support runtime name/revision lookups. */
  key: KEY | string | number;
  recordKind: KIND;
}): Effect.fn.Return<
  NonNullable<RECORD[KEY]>,
  IZerospinError<`${KIND}-not-found`>
> {
  const { record, key, recordKind } = props;
  if (!Object.hasOwn(record, key)) {
    return yield* makeZerospinError({
      code: `${recordKind}-not-found`,
      message: `No ${recordKind} entry exists for key "${key}".`,
    });
  }
  const value = record[key as KEY];
  if (!value || value === null) {
    return yield* makeZerospinError({
      code: `${recordKind}-not-found`,
      message: `The ${recordKind} entry for key "${key}" has no value.`,
    });
  }
  return value;
});
