import type { IAnyError } from '@zerospin/error';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';

export const ownDevelopmentSignals = Effect.fn('ownDevelopmentSignals')(
  function* () {
    const stopped = yield* Deferred.make<void, IAnyError>();
    const stop = () => Deferred.doneUnsafe(stopped, Effect.void);
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
        process.on('SIGHUP', stop);
      }),
      () =>
        Effect.sync(() => {
          process.off('SIGINT', stop);
          process.off('SIGTERM', stop);
          process.off('SIGHUP', stop);
        }),
    );
    return stopped;
  },
);
