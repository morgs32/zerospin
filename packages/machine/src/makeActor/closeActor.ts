import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Ref from 'effect/Ref';
import * as Scope from 'effect/Scope';

import type {
  IActorLifecycle,
  IActorStatus,
  ICleanupMode,
} from './actorLifecycle.js';
import { closeActivation } from './closeActivation.js';
import { terminateActor } from './terminateActor.js';

export const closeActor = (owner: IActorLifecycle): Effect.Effect<void> =>
  Effect.uninterruptible(
    Effect.gen(function* () {
      const cleanupMode = yield* Ref.modify<IActorStatus, ICleanupMode>(
        owner.status,
        current => {
          switch (current._tag) {
            case 'Starting':
            case 'Running':
              return [{ _tag: 'Close' }, { _tag: 'Closing' }] as const;
            case 'DefectTerminated':
              return [
                { _tag: 'Defect', cause: current.cause },
                current,
              ] as const;
            case 'Closing':
            case 'Closed':
              return [{ _tag: 'Closed' }, current] as const;
          }
        },
      );
      if (cleanupMode._tag === 'Closed') {
        return;
      }
      if (cleanupMode._tag === 'Defect') {
        yield* Scope.close(
          owner.actorScope,
          Exit.failCause(cleanupMode.cause),
        ).pipe(Effect.ignoreCause);
        return;
      }

      const action = yield* Ref.get(owner.activeAction);
      if (action !== undefined) yield* Fiber.interrupt(action);
      yield* owner.gate.withPermit(
        Effect.gen(function* () {
          const gatedStatus = yield* Ref.get(owner.status);
          if (gatedStatus._tag === 'DefectTerminated') {
            yield* Scope.close(
              owner.actorScope,
              Exit.failCause(gatedStatus.cause),
            ).pipe(Effect.ignoreCause);
            return;
          }
          if (gatedStatus._tag === 'Closed') {
            return;
          }

          const current = yield* Ref.get(owner.active);
          const closeCause = yield* closeActivation(current, Exit.void);
          if (closeCause !== undefined) {
            const terminalCause = yield* terminateActor(owner, closeCause);
            return yield* Effect.failCause(terminalCause);
          }

          const actorCloseExit = yield* Effect.exit(
            Scope.close(owner.actorScope, Exit.void),
          );
          if (Exit.isFailure(actorCloseExit)) {
            yield* Ref.set(owner.status, {
              _tag: 'DefectTerminated',
              cause: actorCloseExit.cause,
            });
            yield* Deferred.failCause(owner.termination, actorCloseExit.cause);
            return yield* Effect.failCause(actorCloseExit.cause);
          }
          yield* Ref.set(owner.status, { _tag: 'Closed' });
        }),
      );
    }),
  );
