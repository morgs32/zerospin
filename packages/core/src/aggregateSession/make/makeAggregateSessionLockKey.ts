import { mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  AggregateSessionLockSchema,
  type IAggregateSessionLock,
} from '../AggregateSessionLockSchema.ts';

export const makeAggregateSessionLockKey = Effect.fn(
  'makeAggregateSessionLockKey',
)(function* (lock: IAggregateSessionLock) {
  const encoded = yield* Schema.encodeEffect(AggregateSessionLockSchema)(lock, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'aggregate-session-lock-encode-failed',
      prefix: 'Failed to encode the aggregate definition lock',
    }),
  );

  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(sort);
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, sort(entry)]),
      );
    }
    return value;
  };

  const digest = yield* Effect.promise(() =>
    crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(sort(encoded))),
    ),
  );

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
});
