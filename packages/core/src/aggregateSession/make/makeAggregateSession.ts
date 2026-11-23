import {
  emptyTelemetryBatch,
  type ITelemetryCollector,
} from '@zerospin/logger';
import { createStore } from 'zustand/vanilla';

import type { ISessionExecution } from '../../sessionExecution/types.ts';
import { isolateSessionStoreObservers } from '../../sessionFailure/isolateSessionStoreObservers.ts';
import { makeSessionFailureReporter } from '../../sessionFailure/makeSessionFailureReporter.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  IAggregateSessionServices,
  IInitializedAggregateSessionState,
  IAggregateSessionState,
} from '../types.ts';

/**
 * Synchronous aggregate session construction. Creates the stable store only —
 * no ManagedRuntime, layers, SQLite, or backup. Initialization acquires resources
 * before publishing readiness; command functions fail while initialized state is absent.
 */
export function makeAggregateSession<
  DEFINITION extends IAggregateSessionDefinition,
  SERVICES = never,
>(props: {
  sessionDefinition: DEFINITION;
  onTerminalFailure(): void;
  execution: ISessionExecution<IAggregateSessionServices<DEFINITION, SERVICES>>;
}): IAggregateSession<DEFINITION, SERVICES> {
  const { sessionDefinition, execution, onTerminalFailure } = props;
  const store = createStore<
    IAggregateSessionState<
      DEFINITION['models'],
      DEFINITION['claimsSchema']['Type'],
      DEFINITION
    >
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
      aggregateIndex: null,

      dispositionChainHash: null,
      pushIndex: null,

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
      state: IInitializedAggregateSessionState<
        DEFINITION['models'],
        DEFINITION['claimsSchema']['Type'],
        DEFINITION
      >;
    }) => void,
  ): (() => void) => {
    const state = store.getState();
    if (state.initialized !== null) {
      handler({ state });
      return () => {};
    }
    let cancelled = false;
    const unsubscribe = store.subscribe(next => {
      if (next.initialized !== null) {
        unsubscribe();
        queueMicrotask(() => {
          if (cancelled || store.getState().initialized !== next.initialized) {
            return;
          }
          handler({ state: next });
        });
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  };

  const session: IAggregateSession<DEFINITION, SERVICES> = {
    reportFailure,
    runSync: program => {
      const state = store.getState();
      if (state.status === 'failed') throw state.failure;
      return execution.runSync(program);
    },
    runPromise: async (program, options) => {
      const state = store.getState();
      if (state.status === 'failed') throw state.failure;
      return execution.runPromise(program, options);
    },
    sessionDefinition,
    onInitialized,
    release() {
      store.setState({
        status: store.getState().status === 'failed' ? 'failed' : 'disposed',
        initialized: null,
        aggregateIndex: null,

        dispositionChainHash: null,
        pushIndex: null,
        nodeState: null,
      });
    },
    get sessionId() {
      return store.getState().initialized?.sessionId ?? null;
    },
    store,
  };

  return session;
}
