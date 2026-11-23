import * as Cause from 'effect/Cause';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Ref from 'effect/Ref';
import * as Scope from 'effect/Scope';

import type { IActorLifecycle } from './actorLifecycle.js';

export const terminateActor = (
  owner: IActorLifecycle,
  cause: Cause.Cause<never>,
): Effect.Effect<Cause.Cause<never>> =>
  Effect.uninterruptible(
    Effect.gen(function* () {
      yield* Ref.set(owner.status, { _tag: 'DefectTerminated', cause });
      const closeExit = yield* Effect.exit(
        Scope.close(owner.actorScope, Exit.failCause(cause)),
      );
      const terminalCause = Exit.isFailure(closeExit)
        ? Cause.combine(cause, closeExit.cause)
        : cause;
      if (terminalCause !== cause) {
        yield* Ref.set(owner.status, {
          _tag: 'DefectTerminated',
          cause: terminalCause,
        });
      }
      yield* Deferred.failCause(owner.termination, terminalCause);
      return terminalCause;
    }),
  );
