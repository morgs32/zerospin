import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Ref from 'effect/Ref';
import * as Scope from 'effect/Scope';

import type { IAnyState } from '../types.js';

import type {
  IActivation,
  IActorLifecycle,
  IRuntimeStateHandle,
  IStateValue,
} from './actorLifecycle.js';
import { closeActivation } from './closeActivation.js';
import { startActivationRoute } from './startActivationRoute.js';
import { terminateActor } from './terminateActor.js';

export function commitActorTransition(
  owner: IActorLifecycle,
  transition: {
    readonly previous: IActivation;
    readonly state: IAnyState;
    readonly value: IStateValue;
  },
): Effect.Effect<IRuntimeStateHandle> {
  const { previous, state, value } = transition;
  const { runtimeSave } = owner;
  return Effect.uninterruptible(
    Effect.gen(function* () {
      const closeCause = yield* closeActivation(previous, Exit.void);
      if (closeCause !== undefined) {
        const terminalCause = yield* terminateActor(owner, closeCause);
        return yield* Effect.failCause(terminalCause);
      }

      if (runtimeSave !== undefined) {
        const saveExit = yield* Effect.exit(
          Effect.scopedWith(saveScope =>
            Effect.suspend(() =>
              runtimeSave({
                origin: previous.value,
                destination: value,
              }),
            ).pipe(
              Effect.provide(
                Context.add(owner.routeContext, Scope.Scope, saveScope),
              ),
            ),
          ),
        );
        if (Exit.isFailure(saveExit)) {
          const terminalCause = yield* terminateActor(owner, saveExit.cause);
          return yield* Effect.failCause(terminalCause);
        }
      }

      const installExit = yield* Effect.exit(
        Effect.gen(function* () {
          const next = owner.makeActivation(state, value);
          yield* Ref.set(owner.active, next);
          yield* owner.handleStore.publish(next.handle);
          yield* startActivationRoute(owner, next);
          return next.handle;
        }),
      );
      if (Exit.isFailure(installExit)) {
        const terminalCause = yield* terminateActor(owner, installExit.cause);
        return yield* Effect.failCause(terminalCause);
      }
      return installExit.value;
    }),
  );
}
