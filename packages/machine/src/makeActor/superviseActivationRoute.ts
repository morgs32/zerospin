import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Ref from 'effect/Ref';

import type {
  IActivation,
  IActivationRouteExit,
  IActorLifecycle,
} from './actorLifecycle.js';
import { commitActorTransition } from './commitActorTransition.js';
import { terminateActor } from './terminateActor.js';

export function superviseActivationRoute(
  owner: IActorLifecycle,
  activation: IActivation,
  exit: IActivationRouteExit,
): Effect.Effect<void> {
  return owner.gate.withPermit(
    Effect.gen(function* () {
      const current = yield* Ref.get(owner.active);
      if (
        (yield* Ref.get(owner.status))._tag !== 'Running' ||
        current !== activation
      ) {
        return;
      }

      if (Exit.isFailure(exit)) {
        yield* terminateActor(owner, exit.cause);
        return;
      }

      yield* commitActorTransition(owner, {
        previous: activation,
        state: exit.value.state,
        value: exit.value.value,
      }).pipe(Effect.ignoreCause);
    }),
  );
}
