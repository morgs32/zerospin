import * as Effect from 'effect/Effect';
import * as Ref from 'effect/Ref';

import { StateInactive } from '../StateInactive.js';

import type { IActionRequest, IActorLifecycle } from './actorLifecycle.js';
import { assertActorRunning } from './assertActorRunning.js';
import { commitActorTransition } from './commitActorTransition.js';
import { runOwnedActionProgram } from './runOwnedActionProgram.js';

export const executeActorAction = Effect.fnUntraced(function* (
  owner: IActorLifecycle,
  request: IActionRequest,
) {
  const requireOrigin = Effect.gen(function* () {
    yield* assertActorRunning(owner);
    const current = yield* Ref.get(owner.active);
    if (current.id !== request.activationId) {
      return yield* Effect.fail(
        new StateInactive({
          state: request.state.stateName,
          current: current.state.stateName,
        }),
      );
    }
    return current;
  });
  yield* requireOrigin;
  return yield* owner.gate.withPermit(
    Effect.gen(function* () {
      const previous = yield* requireOrigin;
      const success = yield* runOwnedActionProgram(owner, previous, request);
      yield* assertActorRunning(owner);
      return yield* commitActorTransition(owner, {
        previous,
        state: success.state,
        value: success.value,
      });
    }),
  );
});
