import { useEffect, useMemo } from 'react';

import type {
  ILiveRelationalQuery,
  ISqliteClient,
} from '@zerospin/core/drizzle/types';
import { makeLiveQuery } from '@zerospin/live-query/makeLiveQuery';
import { useStore } from 'zustand/react';

/*
 * 1. Build the Drizzle query only when the database or explicit dependencies change.
 * 2. Create one vanilla live-query store for that built query.
 * 3. Subscribe during the React effect lifecycle and release on replacement/unmount.
 * 4. Return the selected vanilla store state to the DevTools route.
 */
export function useLiveQueryOnDb<
  DB extends { $client: ISqliteClient },
  QUERY extends ILiveRelationalQuery,
>(props: {
  query: (db: DB) => QUERY;
  db: DB;
  deps: readonly unknown[];
}): {
  data: QUERY['_']['result'];
  error: Error | undefined;
  updatedAt: Date | undefined;
} {
  // Caller-owned dependency lists intentionally use React's runtime memoization.
  'use no memo';
  const { db, query, deps } = props;

  // 1 — explicit deps control invalidation; callback identity does not.
  // oxlint-disable-next-line react/use-memo, eslint-plugin-react-hooks/exhaustive-deps -- This hook opts out of compiler memoization; caller dependency values control invalidation while callback identity does not.
  const builtQuery = useMemo<QUERY>(() => query(db), [db, ...deps]);

  // 2 — a dependency change replaces the complete vanilla query lifecycle.
  const liveQuery = useMemo(
    () =>
      makeLiveQuery({
        client: db.$client,
        query: builtQuery,
      }),
    [builtQuery, db],
  );

  // 3 — no SQLite listener is installed during React render or abandoned renders.
  useEffect(() => liveQuery.subscribe(), [liveQuery]);

  // 4 — Zustand owns the React subscription to data/error/timestamp changes.
  return useStore(liveQuery.store);
}
