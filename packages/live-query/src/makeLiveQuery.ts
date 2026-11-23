import type { ISqliteClient } from '@zerospin/core/drizzle/types';
import { createStore } from 'zustand/vanilla';

function makeQueryDiagnostic(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Live query failed.', { cause: error });
}

/** One synchronous query store and its committed-table subscription. */
export function makeLiveQuery<RESULT>(props: {
  client: ISqliteClient;
  query: { readonly _: { readonly result: RESULT } } & (
    | { all(): RESULT }
    | { sync(): RESULT }
  );
  /** Ends this query's subscription and reports a committed read failure. */
  onError?: ((error: unknown) => void) | undefined;
}) {
  const { client, query, onError } = props;
  const execute =
    'all' in query && typeof query.all === 'function'
      ? () => query.all()
      : 'sync' in query && typeof query.sync === 'function'
        ? () => query.sync()
        : undefined;
  if (execute === undefined) {
    throw new Error('useLiveQuery requires a sync Drizzle query.');
  }
  const initialRead = client.captureReadTables(execute);
  let watchedTables = initialRead.tables;
  const store = createStore<{
    data: RESULT;
    error: Error | undefined;
    failure: { readonly error: unknown } | null;
    updatedAt: Date | undefined;
  }>()(() => ({
    data: initialRead.result,
    error: undefined,
    failure: null,
    updatedAt: undefined,
  }));
  let subscriptions = 0;
  let detach: (() => void) | undefined;
  let pendingReads = 0;
  let isReading = false;
  let failed = false;

  const publish = (next: Partial<ReturnType<typeof store.getState>>) => {
    try {
      store.setState(next);
    } catch (cause) {
      // Store observers do not own the query result or the committed write.
      console.error('Live-query observer threw', cause);
    }
  };
  const runQuery = () => {
    pendingReads += 1;
    if (isReading) return;
    isReading = true;
    try {
      while (pendingReads > 0 && subscriptions > 0 && !failed) {
        pendingReads -= 1;
        let next: Partial<ReturnType<typeof store.getState>>;
        try {
          const read = client.captureReadTables(execute);
          watchedTables = read.tables;
          next = {
            data: read.result,
            error: undefined,
            failure: null,
            updatedAt: new Date(),
          };
        } catch (error) {
          if (onError !== undefined) {
            failed = true;
            const release = detach;
            detach = undefined;
            try {
              // Fence session execution before notifying query observers.
              onError(error);
            } catch (cause) {
              console.error('Live-query failure reporter threw', cause);
            } finally {
              publish({
                error: makeQueryDiagnostic(error),
                failure: { error },
              });
              try {
                release?.();
              } catch (cause) {
                console.error('Live-query subscription cleanup threw', cause);
              }
            }
            break;
          }
          // Retain the previous successful value and recover on the next commit.
          next = { error: makeQueryDiagnostic(error), failure: { error } };
        }
        publish(next);
      }
    } finally {
      pendingReads = 0;
      isReading = false;
    }
  };

  const subscribe = () => {
    subscriptions += 1;
    if (subscriptions === 1 && !failed) {
      // Install before catch-up so reentrant committed writes are queued.
      detach = client.subscribeToTableChanges(changedTables => {
        if (changedTables.size === 0) return;
        if ([...watchedTables].some(name => changedTables.has(name))) {
          runQuery();
        }
      });
      runQuery();
    }
    let isSubscribed = true;
    return () => {
      if (!isSubscribed) return;
      isSubscribed = false;
      subscriptions -= 1;
      if (subscriptions === 0) {
        detach?.();
        detach = undefined;
        pendingReads = 0;
      }
    };
  };

  return { store, subscribe };
}
