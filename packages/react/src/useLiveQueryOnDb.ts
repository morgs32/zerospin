import { useEffect, useMemo, useState } from 'react';

import type { ISqliteClient } from '@zerospin/core/drizzle/types';
import { makeLiveQuery } from '@zerospin/live-query/makeLiveQuery';
import { isEqual } from 'es-toolkit';
import { useStore } from 'zustand/react';

type ILiveQuery = Parameters<typeof makeLiveQuery>[0]['query'];

/*
 * 1. Stabilize the explicit query key by value.
 * 2. Build the synchronous query when the database or key changes.
 * 3. Create one vanilla live-query store for that built query.
 * 4. Subscribe during the React effect lifecycle and release on replacement/unmount.
 * 5. Return the selected vanilla store state to the React consumer.
 */
export function useLiveQueryOnDb<
  DB extends { $client: ISqliteClient },
  KEY,
  QUERY extends ILiveQuery,
>(props: {
  query: (db: DB, key: KEY) => QUERY;
  db: DB;
  key: KEY;
  onError?: (error: unknown) => void;
  onRenderError?: (error: unknown) => never;
}): {
  data: QUERY['_']['result'];
  error: Error | undefined;
  updatedAt: Date | undefined;
};
export function useLiveQueryOnDb<
  DB extends { $client: ISqliteClient },
  QUERY extends ILiveQuery,
>(props: {
  query: (db: DB) => QUERY;
  db: DB;
  key?: undefined;
  onError?: (error: unknown) => void;
  onRenderError?: (error: unknown) => never;
}): {
  data: QUERY['_']['result'];
  error: Error | undefined;
  updatedAt: Date | undefined;
};
export function useLiveQueryOnDb<
  DB extends { $client: ISqliteClient },
  QUERY extends ILiveQuery,
>(props: {
  query: (db: DB, key?: unknown) => QUERY;
  db: DB;
  key?: unknown;
  onError?: (error: unknown) => void;
  onRenderError?: (error: unknown) => never;
}): {
  data: QUERY['_']['result'];
  error: Error | undefined;
  updatedAt: Date | undefined;
} {
  const { db, query, key, onError, onRenderError } = props;

  // 1 — equal key values preserve the built query across renders.
  const [previousKey, setPreviousKey] = useState(() => key);
  const stableKey = isEqual(previousKey, key) ? previousKey : key;
  if (!Object.is(stableKey, previousKey)) setPreviousKey(() => stableKey);

  // 2 — key value controls when to rebuild the query.
  const builtQuery = useMemo<QUERY>(() => {
    try {
      if (stableKey === undefined) {
        return query(db);
      }
      return query(db, stableKey);
    } catch (error) {
      if (onRenderError !== undefined) return onRenderError(error);
      throw error;
    }
  }, [db, stableKey, onRenderError]); // oxlint-disable-line eslint-plugin-react-hooks/exhaustive-deps -- The explicit key controls query invalidation; caller callback identity does not.

  // 3 — a dependency change replaces the complete vanilla query lifecycle.
  const liveQuery = useMemo(() => {
    try {
      return makeLiveQuery({
        client: db.$client,
        query: builtQuery,
        onError,
      });
    } catch (error) {
      if (onRenderError !== undefined) return onRenderError(error);
      throw error;
    }
  }, [builtQuery, db, onError, onRenderError]);

  // 4 — no SQLite listener is installed during React render or abandoned renders.
  useEffect(() => liveQuery.subscribe(), [liveQuery]);

  // 5 — Zustand owns the React subscription to data/error/timestamp changes.
  const state = useStore(liveQuery.store);
  if (onRenderError !== undefined && state.failure !== null) {
    return onRenderError(state.failure.error);
  }
  return state;
}
