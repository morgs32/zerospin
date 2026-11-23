import type {
  ISessionFailureReporter,
  ISessionLifecycleState,
} from '@zerospin/core/sessionFailure/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { makeTelemetryLayer, type ITelemetryCollector } from '@zerospin/logger';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import type { StoreApi } from 'zustand/vanilla';

import {
  makeSessionLifetime,
  type ISessionBootstrap,
} from './sessionLifecycle/SessionLifetime.ts';
import type { ISessionRuntimeServices } from './sessionRuntime';

/** A stable session selects one disposable lifetime for each execution. */
export function makeSessionLifecycle<APP_SERVICES, INFRASTRUCTURE>(props: {
  layer: Layer.Layer<APP_SERVICES, IAnyError, never> | undefined;
  reportFailure: ISessionFailureReporter;
  store: Pick<StoreApi<ISessionLifecycleState>, 'getState' | 'subscribe'> & {
    setState(state: Partial<ISessionLifecycleState>): void;
  };
  infrastructure: Layer.Layer<INFRASTRUCTURE, IAnyError>;
  telemetryCollector: ITelemetryCollector;
  onDispose(): void;
}) {
  const {
    layer,
    reportFailure,
    store,
    infrastructure,
    telemetryCollector,
    onDispose,
  } = props;
  if (
    layer !== undefined &&
    Object.getPrototypeOf(layer) !== Object.getPrototypeOf(Layer.empty)
  ) {
    throw makeZerospinError({
      code: 'zerospin-app-effect-runtime-mismatch',
      message:
        'The application layer was created by a different Effect runtime than Zerospin Browser. Ensure the app and Zerospin resolve to the same Effect installation, then rebuild.',
    });
  }
  const baseLayer = Layer.mergeAll(
    NanoIdFactory,
    UlidMonotonicFactory,
    infrastructure,
    ...(layer === undefined ? [] : [layer]),
  );
  type IServices = ISessionRuntimeServices | APP_SERVICES | INFRASTRUCTURE;
  const makeLifetime = () =>
    makeSessionLifetime<IServices, IAnyError>({
      runtime: ManagedRuntime.make(
        makeTelemetryLayer(telemetryCollector).pipe(
          Layer.provideMerge(baseLayer),
        ),
      ),
      reportFailure,
      getFailure: () => {
        const state = store.getState();
        return state.status === 'failed' ? state.failure : null;
      },
      onDispose,
    });
  // The initial runtime is lazy; ordinary execution can acquire it before bootstrap.
  let currentLifetime = makeLifetime();
  let pendingInitialization:
    | ReturnType<typeof Promise.withResolvers<void>>
    | undefined;

  const dispose = (): Promise<void> => {
    const pending = pendingInitialization;
    pendingInitialization = undefined;
    if (pending !== undefined) {
      const state = store.getState();
      const failure = state.status === 'failed' ? state.failure : null;
      pending.reject(
        failure !== null
          ? failure
          : makeZerospinError('session-initialization-canceled'),
      );
    }
    const cleanup = currentLifetime.dispose();
    if (store.getState().status !== 'failed') {
      store.setState({ status: 'disposed' });
    }
    return cleanup;
  };
  const assertUsable = () => {
    const state = store.getState();
    const failure = state.status === 'failed' ? state.failure : null;
    if (failure !== null) throw failure;
  };

  return {
    retire() {
      currentLifetime.retire();
    },
    runSync<A, E>(program: Effect.Effect<A, E, IServices>): A {
      assertUsable();
      const lifetime = currentLifetime;
      return lifetime.runSync(program);
    },
    async runPromise<A, E>(
      program: Effect.Effect<A, E, IServices>,
      options?: Effect.RunOptions,
    ): Promise<A> {
      assertUsable();
      const lifetime = currentLifetime;
      return lifetime.runPromise(program, options);
    },
    initialize(bootstrap: ISessionBootstrap<IServices>): Promise<void> {
      const state = store.getState();
      const failure = state.status === 'failed' ? state.failure : null;
      if (failure !== null) return Promise.reject(failure);
      if (pendingInitialization !== undefined) {
        throw makeZerospinError('session-already-mounted');
      }
      if (!currentLifetime.signal.aborted) {
        const lifetime = currentLifetime;
        const admitted = lifetime.initialize(bootstrap);
        if (
          currentLifetime === lifetime &&
          !lifetime.signal.aborted &&
          store.getState().status !== 'ready' &&
          store.getState().status !== 'failed'
        ) {
          store.setState({ status: 'initializing' });
        }
        return admitted;
      }

      const initialization = Promise.withResolvers<void>();
      void initialization.promise.catch(() => undefined);
      pendingInitialization = initialization;
      const preceding = currentLifetime;
      void (async () => {
        try {
          await preceding.closed;
          if (pendingInitialization !== initialization) {
            return;
          }
          assertUsable();
          // Replacement and admission are synchronous after the previous complete shutdown.
          const lifetime = makeLifetime();
          currentLifetime = lifetime;
          pendingInitialization = undefined;
          const admitted = lifetime.initialize(bootstrap);
          if (
            currentLifetime === lifetime &&
            !lifetime.signal.aborted &&
            store.getState().status !== 'ready' &&
            store.getState().status !== 'failed'
          ) {
            store.setState({ status: 'initializing' });
          }
          await admitted;
          initialization.resolve();
        } catch (error) {
          if (pendingInitialization === initialization) {
            pendingInitialization = undefined;
          }
          initialization.reject(error);
        }
      })();
      return initialization.promise;
    },
    dispose,
  };
}
