import { useCallback, useSyncExternalStore } from 'react';

import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import type {
  ILiveRelationalQuery,
  IModelQueryDb,
  ISqliteClient,
} from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { makeZerospinError } from '@zerospin/error';

import { SessionQueryError } from './SessionQueryError';
import { useLiveQueryOnDb } from './useLiveQueryOnDb';
export function useLiveQuery<
  DEFINITION extends IAggregateSessionDefinition,
  MODELS extends IAnyModels & DEFINITION['models'],
  KEY,
  QUERY extends ILiveRelationalQuery,
>(props: {
  session: IAggregateSession<DEFINITION & { models: MODELS }>;
  key: KEY;
  query: (db: IModelQueryDb<MODELS>, key: KEY) => QUERY;
}): {
  readonly data: QUERY['_']['result'];
  readonly updatedAt: Date | undefined;
};

export function useLiveQuery<
  DEFINITION extends IAggregateSessionDefinition,
  MODELS extends IAnyModels & DEFINITION['models'],
  QUERY extends ILiveRelationalQuery,
>(props: {
  session: IAggregateSession<DEFINITION & { models: MODELS }>;
  key?: undefined;
  query: (db: IModelQueryDb<MODELS>) => QUERY;
}): {
  readonly data: QUERY['_']['result'];
  readonly updatedAt: Date | undefined;
};

export function useLiveQuery<
  DEFINITION extends IServiceSessionDefinition,
  MODELS extends IAnyModels & DEFINITION['models'],
  KEY,
  QUERY extends ILiveRelationalQuery,
>(props: {
  session: IServiceSession<DEFINITION, MODELS>;
  key: KEY;
  query: (db: IModelQueryDb<MODELS>, key: KEY) => QUERY;
}): {
  readonly data: QUERY['_']['result'];
  readonly updatedAt: Date | undefined;
};

export function useLiveQuery<
  DEFINITION extends IServiceSessionDefinition,
  MODELS extends IAnyModels & DEFINITION['models'],
  QUERY extends ILiveRelationalQuery,
>(props: {
  session: IServiceSession<DEFINITION, MODELS>;
  key?: undefined;
  query: (db: IModelQueryDb<MODELS>) => QUERY;
}): {
  readonly data: QUERY['_']['result'];
  readonly updatedAt: Date | undefined;
};

// oxlint-disable-next-line typescript/no-explicit-any -- The implementation bridges four typed overloads with different session, key, and query types.
export function useLiveQuery(props: any): any {
  const { session, key, query } = props;
  const reportFailure = useCallback(
    (error: unknown) => session.reportFailure({ origin: 'session', error }),
    [session],
  );
  const onRenderError = useCallback(
    (error: unknown): never => {
      throw new SessionQueryError(session, error);
    },
    [session],
  );
  const getSnapshot = (): { $client: ISqliteClient } | null => {
    const state = session.store.getState();
    return state.initialized?.db ?? null;
  };
  const db = useSyncExternalStore(
    session.store.subscribe,
    getSnapshot,
    getSnapshot,
  );
  if (db === null) {
    const { status, failure } = session.store.getState();
    throw new SessionQueryError(
      session,
      status === 'failed' && failure !== null
        ? failure
        : makeZerospinError({
            code: 'session-store-not-initialized',
            message: 'Session store is not initialized',
          }),
    );
  }

  const { data, updatedAt } = useLiveQueryOnDb({
    db,
    key,
    query,
    onError: reportFailure,
    onRenderError,
  });
  return { data, updatedAt };
}
