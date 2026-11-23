import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  ISessionId,
} from '@zerospin/core/aggregateSession/types';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { createStore } from 'zustand/vanilla';

import type {
  IDevtoolsAggregateSessionEntry,
  IDevtoolsServiceSessionEntry,
  IZerospinDevtoolsStoreState,
} from './types.js';

export const zerospinDevtoolsStore = createStore<IZerospinDevtoolsStoreState>()(
  set => ({
    aggregateSessionsById: new Map(),
    serviceSessionsById: new Map(),
    addAggregateSession: <D extends IAggregateSessionDefinition, SERVICES>(
      entry: {
        readonly sessionId: ISessionId;
        readonly session: IAggregateSession<D, SERVICES>;
      } & Pick<
        IDevtoolsAggregateSessionEntry,
        'getPushPaused' | 'setPushPaused' | 'pushNow'
      >,
    ) =>
      set(state => {
        const { session, sessionId, ...controls } = entry;
        const nextAggregateSessionsById = new Map(state.aggregateSessionsById);
        // Retain read-only closures over the typed session; never widen its mutable store.
        nextAggregateSessionsById.set(sessionId, {
          ...controls,
          sessionId,
          sessionDefinition: session.sessionDefinition,
          subscribe: listener => session.store.subscribe(() => listener()),
          getCommandDb: () => session.store.getState().initialized?.db ?? null,
          getClaims: () => session.store.getState().initialized?.claims ?? null,
          getInitialized: () => session.store.getState().initialized,
          getNodeState: () => session.store.getState().nodeState,
          getAggregateIndex: () => session.store.getState().aggregateIndex,
          getPushIndex: () => session.store.getState().pushIndex,
          getTelemetry: () => session.store.getState().telemetry,
          getModelAttributes: modelName =>
            session.sessionDefinition.models[modelName]?.attributes,
          getModelQuery: modelName => {
            const initialized = session.store.getState().initialized;
            if (initialized === null) {
              throw new Error('Aggregate session is not initialized');
            }
            const modelQuery = initialized.db.query[modelName];
            if (modelQuery === undefined) {
              throw new Error(`Unknown model key: ${modelName}`);
            }
            return modelQuery.findMany();
          },
          clearTelemetry: () =>
            session.store.getState().telemetryCollector.flush(),
        });
        return { aggregateSessionsById: nextAggregateSessionsById };
      }),
    removeAggregateSession: (sessionId: ISessionId) =>
      set(state => {
        if (!state.aggregateSessionsById.has(sessionId)) {
          return state;
        }
        const nextAggregateSessionsById = new Map(state.aggregateSessionsById);
        nextAggregateSessionsById.delete(sessionId);
        return { aggregateSessionsById: nextAggregateSessionsById };
      }),
    addServiceSession: <DEFINITION extends IServiceSessionDefinition>(entry: {
      readonly sessionId: ISessionId;
      readonly session: IServiceSession<DEFINITION>;
    }) =>
      set(state => {
        const { session, sessionId } = entry;
        if (state.serviceSessionsById.has(sessionId)) {
          return state;
        }

        const devtoolsEntry: IDevtoolsServiceSessionEntry = {
          sessionId,
          serviceName: session.sessionDefinition.serviceName,
          actorName: session.sessionDefinition.actorName,
          sessionName: session.sessionDefinition.sessionName,
          modelNames: session.sessionDefinition.modelNames,
          subscribe: listener =>
            session.store.subscribe(() => {
              listener();
            }),
          getCommandDb: () => session.store.getState().initialized?.db ?? null,
          getClaims: () => session.store.getState().initialized?.claims ?? null,
          getInitialized: () => session.store.getState().initialized,
          getNodeState: () => session.store.getState().nodeState,

          getTelemetry: () => session.store.getState().telemetry,
          getServiceIndex: () =>
            session.store.getState().initialized?.serviceIndex ?? null,
          getModelAttributes: modelName =>
            session.sessionDefinition.models[modelName]?.attributes,
          readModelRows: modelName => {
            const initialized = session.store.getState().initialized;
            if (initialized === null) {
              throw new Error('Service session is not initialized');
            }
            const modelQuery = initialized.db.query[modelName];
            if (modelQuery === undefined) {
              throw new Error(`Unknown model key: ${modelName}`);
            }
            return modelQuery.findMany().sync();
          },
          clearTelemetry: () => {
            session.store.getState().telemetryCollector.flush();
          },
        };

        const nextServiceSessionsById = new Map(state.serviceSessionsById);
        nextServiceSessionsById.set(sessionId, devtoolsEntry);
        return { serviceSessionsById: nextServiceSessionsById };
      }),
    removeServiceSession: (sessionId: ISessionId) =>
      set(state => {
        if (!state.serviceSessionsById.has(sessionId)) {
          return state;
        }
        const nextServiceSessionsById = new Map(state.serviceSessionsById);
        nextServiceSessionsById.delete(sessionId);
        return { serviceSessionsById: nextServiceSessionsById };
      }),
  }),
);
