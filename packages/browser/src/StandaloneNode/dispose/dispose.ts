import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

/** Release the existing attachment and its retained subscription exactly once. */
export const dispose = makeFn('StandaloneBrowserSessionApi.dispose')(
  function* (props: { dispose(): void }) {
    const { dispose } = props;
    yield* Effect.sync(dispose);
  },
);
