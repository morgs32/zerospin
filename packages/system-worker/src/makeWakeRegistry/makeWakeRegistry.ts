import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Semaphore from 'effect/Semaphore';
import invariant from 'tiny-invariant';

export type IWakeRegistration<SERVICES = unknown> = {
  readonly readNextWakeAt: () => number | null;
  readonly run: Effect.Effect<void, unknown, SERVICES>;
};

/** Schedule durable Agent work and protect each executing pass with a retry alarm. */
export const makeWakeRegistry = <SERVICES = never>(props: {
  storage: Pick<DurableObjectStorage, 'getAlarm' | 'setAlarm' | 'deleteAlarm'>;
}) => {
  const { storage } = props;
  const registrations = new Map<string, IWakeRegistration<SERVICES>>();
  const scheduling = Semaphore.makeUnsafe(1);
  const dispatch = Semaphore.makeUnsafe(1);
  let running = false;
  let retryNotBefore = 0;

  // Call while holding scheduling: preserve the prior alarm separately from this watchdog.
  const protectAlarm = Effect.fn('WakeRegistry.protectAlarm')(() =>
    Effect.gen(function* () {
      const retryAt = Date.now() + 1_000;
      const scheduledAt = yield* Effect.promise(() => storage.getAlarm());
      if (
        scheduledAt === null ||
        scheduledAt <= Date.now() ||
        scheduledAt > retryAt
      ) {
        yield* Effect.promise(() => storage.setAlarm(retryAt));
      }
      return scheduledAt;
    }),
  );

  const reconcile = Effect.fn('WakeRegistry.reconcile')(
    (replaceAlarm: boolean) =>
      Effect.gen(function* () {
        const priorAlarm = yield* protectAlarm();
        const now = Date.now();
        const protectedUntil = running ? now + 1_000 : retryNotBefore;
        let wakeAt = protectedUntil === 0 ? null : protectedUntil;
        for (const registration of registrations.values()) {
          const deadline = registration.readNextWakeAt();
          if (deadline === null) continue;
          const scheduledDeadline =
            deadline <= now ? Math.max(now, protectedUntil) : deadline;
          if (wakeAt === null || scheduledDeadline < wakeAt) {
            wakeAt = scheduledDeadline;
          }
        }
        if (wakeAt === null) {
          yield* Effect.promise(() => storage.deleteAlarm());
          return;
        }
        const scheduledAt = yield* Effect.promise(() => storage.getAlarm());
        if (!replaceAlarm && priorAlarm !== null && priorAlarm > now) {
          wakeAt = Math.min(wakeAt, priorAlarm);
        }
        if (scheduledAt !== wakeAt) {
          yield* Effect.promise(() => storage.setAlarm(wakeAt));
        }
      }).pipe(
        Effect.onExit(exit =>
          Effect.sync(() => {
            if (Exit.isFailure(exit)) retryNotBefore = Date.now() + 1_000;
          }),
        ),
        scheduling.withPermits(1),
      ),
  );

  return {
    register(name: string, registration: IWakeRegistration<SERVICES>): void {
      invariant(
        !registrations.has(name),
        `Wake operation already registered: ${name}`,
      );
      registrations.set(name, registration);
    },
    reconcile: () => reconcile(false),
    run: Effect.fn('WakeRegistry.run')(() =>
      Effect.gen(function* () {
        running = true;
        yield* protectAlarm().pipe(scheduling.withPermits(1));
        const exits = yield* Effect.forEach(
          [...registrations.values()],
          registration => Effect.exit(registration.run),
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
        running = false;
        retryNotBefore = failure === undefined ? 0 : Date.now() + 1_000;
        yield* reconcile(true);
        if (failure !== undefined) return yield* Effect.failCause(failure);
      }).pipe(
        Effect.onExit(exit =>
          Effect.sync(() => {
            running = false;
            if (Exit.isFailure(exit)) retryNotBefore = Date.now() + 1_000;
          }),
        ),
        dispatch.withPermits(1),
      ),
    ),
  };
};

export type IWakeRegistry<SERVICES = unknown> = ReturnType<
  typeof makeWakeRegistry<SERVICES>
>;
