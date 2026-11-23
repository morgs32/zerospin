import { reportSessionDefects } from '@zerospin/core/sessionExecution/reportSessionDefects';
import { runSessionPreflight } from '@zerospin/core/sessionExecution/runSessionPreflight';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import { makeZerospinError, type IZerospinError } from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import type * as Scope from 'effect/Scope';

/** Native execution belongs to one lifetime, including roots suspended by runSync. */
export function makeSessionLifetimeExecution<SERVICES, FAILURE>(props: {
  runtime: ManagedRuntime.ManagedRuntime<SERVICES, FAILURE>;
  signal: AbortSignal;
  workScope: Scope.Closeable;
  reportFailure: ISessionFailureReporter;
  getFailure(): IZerospinError | null;
  onClosingFailure(error: unknown): void;
}) {
  const {
    runtime,
    signal,
    workScope,
    reportFailure,
    getFailure,
    onClosingFailure,
  } = props;
  const observed = new WeakSet<Fiber.Fiber<unknown, unknown>>();
  const observeExit = <A, E>(exit: Exit.Exit<A, E>) => {
    // Capture before reporting: an observer may itself dispose the lifetime.
    if (
      signal.aborted &&
      Exit.isFailure(exit) &&
      !Cause.hasInterruptsOnly(exit.cause)
    ) {
      onClosingFailure(Cause.squash(exit.cause));
    }
    reportSessionDefects(exit, reportFailure);
  };
  const enroll = <A, E>(fiber: Fiber.Fiber<A, E>) => {
    if (observed.has(fiber)) return;
    observed.add(fiber);
    Fiber.runIn(fiber, workScope);
    // Fiber.runIn awaits interruption but its successful finalizer returns the Exit.
    fiber.addObserver(observeExit);
  };
  const assertOpen = () => {
    const failure = getFailure();
    if (failure !== null) throw failure;
    if (signal.aborted) {
      throw makeZerospinError('session-initialization-canceled');
    }
  };
  const runFork = <A, E>(
    program: Effect.Effect<A, E, SERVICES>,
    options?: Effect.RunOptions,
  ) => {
    assertOpen();
    return runSessionPreflight({
      reportFailure,
      program: Effect.sync(() => {
        const fiber = runtime.runFork(program, {
          ...options,
          signal:
            options?.signal === undefined
              ? signal
              : AbortSignal.any([signal, options.signal]),
          onFiberStart: fiber => {
            enroll(fiber);
            options?.onFiberStart?.(fiber);
          },
        });
        // Native onFiberStart is skipped when the root completes synchronously.
        enroll(fiber);
        return fiber;
      }),
    });
  };
  const execution: ISessionExecution<SERVICES> = {
    runSync(program) {
      assertOpen();
      const exit = runSessionPreflight({
        reportFailure,
        program: Effect.sync(() => {
          return runtime.runSyncExit(program);
        }),
      });
      let suspended = false;
      if (Exit.isFailure(exit)) {
        for (const reason of exit.cause.reasons) {
          if (
            Cause.isDieReason(reason) &&
            Cause.isAsyncFiberError(reason.defect)
          ) {
            suspended = true;
            // Enroll before interrupting: asynchronous finalizers must precede DB closure.
            enroll(reason.defect.fiber);
            reason.defect.fiber.interruptUnsafe();
            reason.defect.fiber.currentDispatcher.flush();
          }
        }
      }
      // A suspended root's eventual Exit is observed separately from this refusal.
      if (suspended) reportSessionDefects(exit, reportFailure);
      else observeExit(exit);
      return Effect.runSync(exit);
    },
    async runPromise(program, options) {
      const fiber = runFork(program, options);
      const exit = await Effect.runPromise(Fiber.await(fiber));
      // The root observer reports its complete Exit once; propagation stays native.
      return Effect.runSync(exit);
    },
  };

  return {
    ...execution,
    runFork,
  };
}
