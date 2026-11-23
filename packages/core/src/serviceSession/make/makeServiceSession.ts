import {
  emptyTelemetryBatch,
  type ITelemetryCollector,
} from '@zerospin/logger';
import type { CuidFactory } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import { createStore } from 'zustand/vanilla';

import type { IAnyModels } from '../../models/types.ts';
import type { ISessionExecution } from '../../sessionExecution/types.ts';
import { isolateSessionStoreObservers } from '../../sessionFailure/isolateSessionStoreObservers.ts';
import { makeSessionFailureReporter } from '../../sessionFailure/makeSessionFailureReporter.ts';
import { ServiceSessionCommandExecution } from '../ServiceSessionCommandExecution.ts';
import type {
  IInitializedServiceSession,
  IServiceSession,
  IServiceSessionCommandExecution,
  IServiceSessionDefinition,
  IServiceSessionState,
} from '../types.ts';
/**
 * Synchronous service session construction. Creates the stable store only —
 * no ManagedRuntime, SQLite, or backup. The browser lifetime publishes one
 * admitted capability when its local replica is usable.
 */
export function makeServiceSession<
  DEFINITION extends IServiceSessionDefinition,
  MODELS extends IAnyModels = DEFINITION['models'],
  SERVICES = never,
>(props: {
  sessionDefinition: DEFINITION;
  onTerminalFailure(): void;
  models: MODELS;
  execution: ISessionExecution<SERVICES | CuidFactory>;
}): IServiceSession<DEFINITION, MODELS, SERVICES> {
  const {
    sessionDefinition,
    models,
    execution: executor,
    onTerminalFailure,
  } = props;
  let execution: IServiceSessionCommandExecution<SERVICES> | undefined;
  let releaseGeneration = 0;
  const store = createStore<
    IServiceSessionState<MODELS, DEFINITION['claimsSchema']['Type']>
  >(set => {
    let telemetry = emptyTelemetryBatch();
    let ownTelemetry = emptyTelemetryBatch();
    let telemetryPublicationQueued = false;
    const queueTelemetryPublication = () => {
      if (telemetryPublicationQueued) return;
      telemetryPublicationQueued = true;
      queueMicrotask(() => {
        telemetryPublicationQueued = false;
        set({ telemetry });
      });
    };
    const telemetryCollector: ITelemetryCollector = {
      addSpan: span => {
        ownTelemetry = {
          ...ownTelemetry,
          spans: [...ownTelemetry.spans, span],
        };
        telemetry = { ...telemetry, spans: [...telemetry.spans, span] };
        queueTelemetryPublication();
      },
      addLog: log => {
        ownTelemetry = { ...ownTelemetry, logs: [...ownTelemetry.logs, log] };
        telemetry = { ...telemetry, logs: [...telemetry.logs, log] };
        queueTelemetryPublication();
      },
      addLinks: links => {
        ownTelemetry = {
          ...ownTelemetry,
          links: [...ownTelemetry.links, ...links],
        };
        telemetry = { ...telemetry, links: [...telemetry.links, ...links] };
        queueTelemetryPublication();
      },
      merge: batch => {
        telemetry = {
          spans: [...telemetry.spans, ...batch.spans],
          logs: [...telemetry.logs, ...batch.logs],
          links: [...telemetry.links, ...batch.links],
        };
        queueTelemetryPublication();
      },
      flushOwn: () => {
        const batch = ownTelemetry;
        ownTelemetry = emptyTelemetryBatch();
        return batch;
      },
      flush: () => {
        const batch = telemetry;
        telemetry = emptyTelemetryBatch();
        ownTelemetry = emptyTelemetryBatch();
        queueTelemetryPublication();
        return batch;
      },
    };

    return {
      status: 'idle',
      failure: null,
      initialized: null,
      telemetry,
      telemetryCollector,
    };
  });
  isolateSessionStoreObservers(store);
  const reportFailure = makeSessionFailureReporter({
    store,
    onTerminalFailure,
  });
  const onInitialized = (
    handler: (props: {
      state: IInitializedServiceSession<
        MODELS,
        DEFINITION['claimsSchema']['Type']
      >;
    }) => void,
  ): (() => void) => {
    const initialized = store.getState().initialized;
    if (initialized !== null) {
      handler({ state: initialized });
      return () => {};
    }
    let canceled = false;
    const unsubscribe = store.subscribe(next => {
      const initialized = next.initialized;
      if (initialized !== null) {
        const generation = releaseGeneration;
        unsubscribe();
        queueMicrotask(() => {
          const current = store.getState().initialized;
          if (
            canceled ||
            releaseGeneration !== generation ||
            current === null ||
            current.db !== initialized.db ||
            current.sessionId !== initialized.sessionId
          ) {
            return;
          }
          handler({ state: initialized });
        });
      }
    });
    return () => {
      canceled = true;
      unsubscribe();
    };
  };
  const provideExecution = <A, E>(
    program: Effect.Effect<
      A,
      E,
      SERVICES | CuidFactory | ServiceSessionCommandExecution
    >,
  ) =>
    Effect.context<SERVICES | CuidFactory>().pipe(
      Effect.flatMap(context =>
        program.pipe(
          Effect.provideService(ServiceSessionCommandExecution, {
            getCurrent() {
              const current = execution;
              if (current === undefined) return undefined;
              return {
                ...current,
                stage: props =>
                  current.stage(props).pipe(Effect.provideContext(context)),
                validate: props =>
                  current.validate(props).pipe(Effect.provideContext(context)),
              };
            },
          }),
        ),
      ),
    );

  const session: IServiceSession<DEFINITION, MODELS, SERVICES> = {
    reportFailure,
    runSync: program => {
      const state = store.getState();
      if (state.status === 'failed') throw state.failure;
      return executor.runSync(provideExecution(program));
    },
    runPromise: async (program, options) => {
      const state = store.getState();
      if (state.status === 'failed') throw state.failure;
      return executor.runPromise(provideExecution(program), options);
    },
    bindCommandExecution(next) {
      execution = next;
      return () => {
        if (execution === next) execution = undefined;
      };
    },
    release() {
      ++releaseGeneration;
      execution = undefined;
      store.setState({
        status: store.getState().status === 'failed' ? 'failed' : 'disposed',
        initialized: null,
        nodeState: null,
      });
    },
    sessionDefinition,
    models,
    get sessionId() {
      return store.getState().initialized?.sessionId ?? null;
    },
    onInitialized,
    store,
  };
  return session;
}
