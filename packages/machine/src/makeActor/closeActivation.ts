import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Ref from 'effect/Ref';
import * as Scope from 'effect/Scope';

import type { IActivation } from './actorLifecycle.js';

export const closeActivation = (
  activation: IActivation,
  exit: Exit.Exit<unknown, unknown>,
): Effect.Effect<Cause.Cause<never> | undefined> =>
  Effect.gen(function* () {
    const closeExit = yield* Effect.exit(Scope.close(activation.scope, exit));
    if (Exit.isFailure(closeExit)) {
      return closeExit.cause;
    }

    const routeFiber = yield* Ref.get(activation.routeFiber);
    if (routeFiber === undefined) {
      return undefined;
    }
    const routeExit = yield* Fiber.await(routeFiber);
    return Exit.isFailure(routeExit) &&
      !Cause.hasInterruptsOnly(routeExit.cause)
      ? routeExit.cause
      : undefined;
  });
