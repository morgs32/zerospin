import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Ref from 'effect/Ref';
import * as Scope from 'effect/Scope';

import type {
  IActionRequest,
  IActivation,
  IActorLifecycle,
} from './actorLifecycle.js';
import { assertActorRunning } from './assertActorRunning.js';
import { invokeActionProgram } from './invokeActionProgram.js';

/** Enrollment and closing recheck are masked; callers own interruptible waiting and cancellation. */
export const runOwnedActionProgram = Effect.fnUntraced(function* (
  owner: IActorLifecycle,
  previous: IActivation,
  request: IActionRequest,
) {
  return yield* Effect.uninterruptibleMask(restore =>
    Effect.gen(function* () {
      const program = invokeActionProgram({
        states: owner.states,
        path: request.path,
        action: request.action,
        origin: previous.value,
        payload: request.payload,
      }).pipe(
        Effect.provide(
          Context.add(owner.routeContext, Scope.Scope, previous.scope),
        ),
        Effect.interruptible,
      );
      const fiber = yield* Effect.forkIn(program, owner.actorScope, {
        startImmediately: true,
      });
      yield* Ref.set(owner.activeAction, fiber);
      return yield* Effect.gen(function* () {
        yield* assertActorRunning(owner);
        return yield* restore(Fiber.join(fiber));
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            yield* Fiber.interrupt(fiber);
            yield* Ref.set(owner.activeAction, undefined);
          }),
        ),
      );
    }),
  );
});
