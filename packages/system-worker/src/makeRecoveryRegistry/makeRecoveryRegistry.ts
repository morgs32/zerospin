import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Semaphore from 'effect/Semaphore';
import invariant from 'tiny-invariant';

/*
 * Repo recovery operations share one scheduled wake-up through named
 * registrations and in-memory holds. Registration is inert; each wake-up runs
 * every operation against durable state, including after a cold activation.
 * Holds preserve an earlier scheduled wake-up and rearm a consumed alarm.
 * Releasing the final hold removes the recovery alarm.
 *
 * 1. Track recovery operations and held names.
 * 2. Reconcile the shared one-second wake-up against current holds.
 * 3. Acquire or release a recovery hold before awaiting scheduling.
 * 4. Register one lazy recovery Effect per name.
 * 5. Settle all recovery operations independently before reporting failures.
 */
export const makeRecoveryRegistry = <SERVICES = never>(props: {
  storage: Pick<DurableObjectStorage, 'getAlarm' | 'setAlarm' | 'deleteAlarm'>;
}) => {
  const { storage } = props;

  // 1 — holds protect recovery, including producers that have not committed yet
  const recoveryHolds = new Set<string>();
  const operations = new Map<string, Effect.Effect<void, unknown, SERVICES>>();
  const scheduling = Semaphore.makeUnsafe(1);

  // 2 — serialize storage scheduling so concurrent recoveries preserve earlier wake-ups
  const reconcileWake = Effect.fn('RecoveryRegistry.reconcileWake')(() =>
    Effect.gen(function* () {
      if (recoveryHolds.size === 0) {
        yield* Effect.promise(() => storage.deleteAlarm());
        return;
      }
      const scheduledAt = yield* Effect.promise(() => storage.getAlarm());
      const wakeAt = Date.now() + 1_000;
      if (scheduledAt === null || scheduledAt > wakeAt) {
        yield* Effect.promise(() => storage.setAlarm(wakeAt));
      }
    }).pipe(scheduling.withPermits(1)),
  );

  return {
    hold: Effect.fn('RecoveryRegistry.hold')(function* (name: string) {
      // 3 — membership changes before scheduling can wait for another recovery
      recoveryHolds.add(name);
      yield* reconcileWake();
    }),
    release: Effect.fn('RecoveryRegistry.release')(function* (name: string) {
      recoveryHolds.delete(name);
      yield* reconcileWake();
    }),
    register(
      name: string,
      effect: Effect.Effect<void, unknown, SERVICES>,
    ): void {
      // 4 — construction binds work without touching storage or running it
      invariant(
        !operations.has(name),
        `Recovery operation already registered: ${name}`,
      );
      operations.set(name, effect);
    },
    run: Effect.fn('RecoveryRegistry.run')(function* () {
      // 5 — a failure must not interrupt another registered operation
      const exits = yield* Effect.forEach(
        [...operations.values()],
        operation => Effect.exit(operation),
        { concurrency: 'unbounded' },
      );
      let failure: Cause.Cause<unknown> | undefined;
      for (const exit of exits) {
        if (Exit.isFailure(exit)) {
          failure =
            failure === undefined
              ? exit.cause
              : Cause.combine(failure, exit.cause);
        }
      }
      yield* reconcileWake();
      if (failure !== undefined) return yield* Effect.failCause(failure);
    }),
  };
};

export type IRecoveryRegistry<SERVICES = unknown> = ReturnType<
  typeof makeRecoveryRegistry<SERVICES>
>;
