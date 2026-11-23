import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Ref from 'effect/Ref';
import * as Scope from 'effect/Scope';

import type { IActivation, IActorLifecycle } from './actorLifecycle.js';
import { invokeActivationProgram } from './invokeActivationProgram.js';
import { superviseActivationRoute } from './superviseActivationRoute.js';

export function startActivationRoute(
  owner: IActorLifecycle,
  activation: IActivation,
): Effect.Effect<void> {
  const activationStateName = activation.state.stateName;
  const stateRoutes = Object.hasOwn(owner.routes, activationStateName)
    ? owner.routes[activationStateName]
    : undefined;
  const program = stateRoutes?.onActivation;
  if (program === undefined) {
    return Effect.void;
  }
  const path = `${activationStateName}.onActivation`;

  return Effect.gen(function* () {
    const activationRouteContext = Context.add(
      owner.routeContext,
      Scope.Scope,
      activation.scope,
    );
    const activationRouteFiber = yield* Effect.forkIn(
      invokeActivationProgram({
        states: owner.states,
        path,
        program,
        origin: activation.value,
      }).pipe(Effect.provide(activationRouteContext)),
      activation.scope,
    );
    yield* Ref.set(activation.routeFiber, activationRouteFiber);
    yield* Effect.forkIn(
      Fiber.await(activationRouteFiber).pipe(
        Effect.flatMap(exit =>
          superviseActivationRoute(owner, activation, exit),
        ),
      ),
      owner.actorScope,
    );
  });
}
