import type { IDevelopmentHistory } from '@zerospin/core/Node/DevelopmentHistorySchema';
import { makeZerospinError } from '@zerospin/error';

import {
  selectDevelopmentStorage,
  type RememberedDevelopmentStorage,
} from './selectDevelopmentStorage.ts';

export function makeDiscoveryTransaction(databaseName: string) {
  return async function transaction<A>(
    mode: IDBTransactionMode,
    work: (
      store: IDBObjectStore,
      complete: (value: A) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<A> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('identities');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(makeZerospinError({ code: 'node-discovery-blocked' }));
    });
    try {
      return await new Promise<A>((resolve, reject) => {
        const tx = db.transaction('identities', mode);
        let result: { value: A } | undefined;
        let failure: unknown;
        tx.oncomplete = () =>
          result === undefined
            ? reject(makeZerospinError({ code: 'node-discovery-incomplete' }))
            : resolve(result.value);
        tx.onabort = () => reject(failure ?? tx.error);
        tx.onerror = () => {
          failure ??= tx.error;
        };
        const fail = (error: unknown) => {
          failure = error;
          tx.abort();
        };
        try {
          work(
            tx.objectStore('identities'),
            value => {
              result = { value };
            },
            fail,
          );
        } catch (error) {
          fail(error);
        }
      });
    } finally {
      db.close();
    }
  };
}

/** Check revocation and record an authenticated database change in the same transaction. */
export function resolveDiscoveredDatabase<
  Entry extends {
    invalidatedAt: number;
    eligible: boolean;
    developmentStorage?: typeof RememberedDevelopmentStorage.Type | undefined;
  },
>(
  transaction: ReturnType<typeof makeDiscoveryTransaction>,
  decodeEntry: (value: unknown) => Entry,
  key: string,
  revision: number,
  online: boolean,
  proof?: IDevelopmentHistory,
) {
  return transaction<typeof RememberedDevelopmentStorage.Type | undefined>(
    'readwrite',
    (store, done, fail) => {
      const read = store.get(key);
      read.onsuccess = () => {
        try {
          const entry =
            read.result === undefined ? undefined : decodeEntry(read.result);
          if (
            (entry?.invalidatedAt ?? 0) > revision ||
            (!online && !entry?.eligible)
          ) {
            throw makeZerospinError('node-authentication-cancelled');
          }
          const selected = selectDevelopmentStorage(
            entry?.developmentStorage,
            proof,
            online,
          );
          // Bind a legacy file to its first observed history only after successful registration.
          // Persist an established transition before opening SQLite so interrupted boots resume it.
          if (
            entry?.developmentStorage &&
            selected !== entry.developmentStorage
          ) {
            store.put({ ...entry, developmentStorage: selected }, key);
          }
          done(selected);
        } catch (error) {
          fail(error);
        }
      };
    },
  );
}
