import * as Effect from 'effect/Effect';
import * as Ref from 'effect/Ref';

import type { IActorLifecycle } from './actorLifecycle.js';

export const assertActorRunning = Effect.fnUntraced(function* (
  owner: IActorLifecycle,
) {
  const status = yield* Ref.get(owner.status);
  switch (status._tag) {
    case 'Running':
      return;
    case 'Starting':
      return yield* Effect.die(new TypeError('MachineActor is not ready'));
    case 'DefectTerminated':
      return yield* Effect.failCause(status.cause);
    case 'Closing':
    case 'Closed':
      return yield* Effect.die(
        new TypeError('MachineActor is outside its owning Scope'),
      );
  }
});
