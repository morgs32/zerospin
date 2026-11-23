import { reportSessionDefects } from '@zerospin/core/sessionExecution/reportSessionDefects';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import { makeZerospinError, type IZerospinError } from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Scope from 'effect/Scope';

import { makeSessionLifetimeExecution } from './makeSessionLifetimeExecution.ts';

export type ISessionBootstrap<SERVICES> = (context: {
  execution: ISessionExecution<SERVICES>;
  signal: AbortSignal;
}) => Effect.Effect<void, unknown, SERVICES | Scope.Scope>;

/** One disposable owner fences execution, joins its work and releases resources in order. */
export function makeSessionLifetime<SERVICES, FAILURE>(props: {
  runtime: ManagedRuntime.ManagedRuntime<SERVICES, FAILURE>;
  reportFailure: ISessionFailureReporter;
  getFailure(): IZerospinError | null;
  onDispose(): void;
}) {
  const { runtime, reportFailure, getFailure, onDispose } = props;
  const controller = new AbortController();
  const resourceScope = Scope.makeUnsafe('sequential');
  const workScope = Scope.makeUnsafe('parallel');
  const closed = Promise.withResolvers<void>();
  void closed.promise.catch(() => undefined);
  let closing = false;
  let initialization:
    | ReturnType<typeof Promise.withResolvers<void>>
    | undefined;
  let bootstrapFiber: Fiber.Fiber<void, unknown> | undefined;
  let startupFailure: { error: unknown } | undefined;
  let cleanupFailure: { error: unknown } | undefined;

  const recordCleanupFailure = (error: unknown) => {
    if (cleanupFailure !== undefined) return;
    // Disposal rejects with the first error; Exit observers report its full Cause.
    cleanupFailure = { error };
  };
  const recordCleanupExit = <A, E>(exit: Exit.Exit<A, E>) => {
    if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
      recordCleanupFailure(Cause.squash(exit.cause));
    }
    reportSessionDefects(exit, reportFailure);
  };
  const execution = makeSessionLifetimeExecution({
    runtime,
    reportFailure,
    getFailure,
    signal: controller.signal,
    workScope,
    onClosingFailure: recordCleanupFailure,
  });
  const initializationFailure = () =>
    getFailure() ??
    startupFailure?.error ??
    makeZerospinError('session-initialization-canceled');

  const cleanup = async () => {
    const finish = async (program: Effect.Effect<unknown, unknown>) => {
      try {
        recordCleanupExit(await Effect.runPromiseExit(program));
      } catch (error) {
        recordCleanupFailure(error);
      }
    };
    if (bootstrapFiber !== undefined) {
      await finish(Fiber.interrupt(bootstrapFiber));
    }
    await finish(Scope.close(workScope, Exit.void));
    await finish(Scope.close(resourceScope, Exit.void));
    await finish(runtime.disposeEffect);
    initialization?.reject(initializationFailure());
    if (cleanupFailure === undefined) closed.resolve();
    else closed.reject(cleanupFailure.error);
  };
  const retire = () => {
    if (closing) return;
    closing = true;
    // A root observer can retire before native runFork returns and enrolls its fiber.
    queueMicrotask(() => {
      void cleanup();
    });
    controller.abort();
    recordCleanupExit(Effect.runSyncExit(Effect.sync(onDispose)));
  };
  const observeStartup = (exit: Exit.Exit<void, unknown>) => {
    if (Exit.isSuccess(exit) && !closing) {
      initialization?.resolve();
      return;
    }
    if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
      startupFailure ??= { error: Cause.squash(exit.cause) };
      if (!closing) {
        try {
          reportFailure({ origin: 'session', error: exit.cause });
        } catch (error) {
          recordCleanupFailure(error);
        }
      }
    }
    retire();
  };

  return {
    retire,
    runSync: execution.runSync,
    runPromise: execution.runPromise,
    signal: controller.signal,
    closed: closed.promise,
    initialize(request: ISessionBootstrap<SERVICES>): Promise<void> {
      if (initialization !== undefined) {
        throw makeZerospinError('session-already-mounted');
      }
      if (closing) {
        throw makeZerospinError('session-initialization-canceled');
      }
      initialization = Promise.withResolvers<void>();
      void initialization.promise.catch(() => undefined);
      try {
        bootstrapFiber = execution.runFork(
          Effect.suspend(() =>
            request({ execution, signal: controller.signal }),
          ).pipe(
            Scope.provide(resourceScope),
            Effect.onExit(exit =>
              Effect.sync(() => {
                // Root defect observers can retire before observeStartup is enrolled.
                if (
                  Exit.isFailure(exit) &&
                  !Cause.hasInterruptsOnly(exit.cause)
                ) {
                  startupFailure ??= { error: Cause.squash(exit.cause) };
                }
              }),
            ),
          ),
        );
        bootstrapFiber.addObserver(observeStartup);
      } catch (error) {
        startupFailure ??= { error };
        if (!closing) {
          try {
            reportFailure({ origin: 'session', error });
          } catch (reportingError) {
            recordCleanupFailure(reportingError);
          }
        }
        retire();
      }
      return initialization.promise;
    },
    dispose(): Promise<void> {
      initialization?.reject(initializationFailure());
      retire();
      return closed.promise;
    },
  };
}
