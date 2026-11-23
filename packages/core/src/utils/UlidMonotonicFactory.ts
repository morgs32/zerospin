import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { monotonicFactory as ulidMonotonicFactory } from 'ulid';

import { MonotonicFactory } from '../services/MonotonicFactory.ts';

export const UlidMonotonicFactory = Layer.effect(
  MonotonicFactory,
  Effect.sync(() => {
    const makeMonotonic = ulidMonotonicFactory();
    return MonotonicFactory.of(() => Effect.sync(() => makeMonotonic()));
  }),
);
