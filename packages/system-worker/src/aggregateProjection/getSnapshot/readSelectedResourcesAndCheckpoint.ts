import { runSynchronousExit } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';

/** Read the checkpoint and selected resources within one synchronous observation. */
export function readSelectedResourcesAndCheckpoint<
  Checkpoint,
  Resource,
  CE,
  CR,
  E,
  R,
>(
  readCheckpoint: Effect.Effect<Checkpoint, CE, CR>,
  readResources: () => Effect.Effect<readonly Resource[], E, R>,
) {
  return Effect.gen(function* () {
    const context = yield* Effect.context<CR | R>();
    return yield* runSynchronousExit(
      Effect.gen(function* () {
        const checkpoint = yield* readCheckpoint;
        const resources = yield* readResources();
        return { checkpoint, resources };
      }),
      Effect.runSyncExitWith(context),
    );
  });
}
