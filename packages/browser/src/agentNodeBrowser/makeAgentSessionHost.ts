import type { ISessionId } from '@zerospin/core/aggregateSession/types';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import { isolateSessionStoreObservers } from '@zerospin/core/sessionFailure/isolateSessionStoreObservers';
import { makeSessionFailureReporter } from '@zerospin/core/sessionFailure/makeSessionFailureReporter';
import type {
  ISessionFailureReporter,
  ISessionLifecycleState,
} from '@zerospin/core/sessionFailure/types';
import type { IAnyError } from '@zerospin/error';
import {
  emptyTelemetryBatch,
  type ITelemetryBatch,
  type ITelemetryCollector,
} from '@zerospin/logger';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { makeSessionLifecycle } from '../makeSessionLifecycle.ts';

export type IAgentSessionHostState<NODE> = ISessionLifecycleState & {
  node: NODE | null;
  telemetry: ITelemetryBatch;
  telemetryCollector: ITelemetryCollector;
};

/** The shared shell owns application execution and lifecycle, never Node command or resource facts. */
export function makeAgentSessionHost<
  NODE extends { sessionId: ISessionId; revoke(): void; dispose(): void },
>(props: {
  layer: Layer.Layer<unknown, IAnyError, never> | undefined;
  bootstrap(props: {
    store: StoreApi<IAgentSessionHostState<NODE>>;
    reportFailure: ISessionFailureReporter;
    execution: ISessionExecution<unknown>;
    signal: AbortSignal;
  }): Effect.Effect<void, unknown, unknown>;
}) {
  const bootstrap = props.bootstrap.bind(props);
  const { layer } = props;
  const store = createStore<IAgentSessionHostState<NODE>>((set, get) => {
    let own = emptyTelemetryBatch();
    const merge = (batch: ITelemetryBatch, produced = false) => {
      const append = (before: ITelemetryBatch): ITelemetryBatch => ({
        spans: [...before.spans, ...batch.spans],
        logs: [...before.logs, ...batch.logs],
        links: [...before.links, ...batch.links],
      });
      if (produced) own = append(own);
      set(state => ({ telemetry: append(state.telemetry) }));
    };
    return {
      status: 'idle',
      failure: null,
      node: null,
      telemetry: emptyTelemetryBatch(),
      telemetryCollector: {
        addSpan: span =>
          merge({ ...emptyTelemetryBatch(), spans: [span] }, true),
        addLog: log => merge({ ...emptyTelemetryBatch(), logs: [log] }, true),
        addLinks: links => merge({ ...emptyTelemetryBatch(), links }, true),
        merge,
        flushOwn: () => {
          const batch = own;
          own = emptyTelemetryBatch();
          return batch;
        },
        flush: () => {
          const batch = get().telemetry;
          own = emptyTelemetryBatch();
          set({ telemetry: emptyTelemetryBatch() });
          return batch;
        },
      },
    };
  });
  isolateSessionStoreObservers(store);
  const reportFailure = makeSessionFailureReporter({
    store,
    onTerminalFailure: () => {
      store.getState().node?.revoke();
      lifecycle.retire();
    },
  });
  const lifecycle = makeSessionLifecycle({
    layer,
    infrastructure: Layer.empty,
    reportFailure,
    store,
    telemetryCollector: store.getState().telemetryCollector,
    onDispose: () => {
      store.getState().node?.dispose();
      if (store.getState().status !== 'failed') store.setState({ node: null });
    },
  });
  return {
    store,
    reportFailure,
    runSync: lifecycle.runSync,
    runPromise: lifecycle.runPromise,
    initialize() {
      const state = store.getState();
      if (state.status === 'failed') return Promise.reject(state.failure);
      return lifecycle.initialize(({ execution, signal }) =>
        bootstrap({ store, reportFailure, execution, signal }),
      );
    },
    dispose() {
      const cleanup = lifecycle.dispose();
      store.setState({ node: null });
      return cleanup;
    },
    get sessionId() {
      return store.getState().node?.sessionId ?? null;
    },
  };
}
