import type { ISqliteStatementParameter } from '@zerospin/core/drizzle/types';
import { ensureZerospinError, makeZerospinError } from '@zerospin/error';
import { sql, type AnyRelations } from 'drizzle-orm';
import { durableSQLiteCodecs } from 'drizzle-orm/durable-sqlite/codecs';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

import { recreateNodeStorage } from './recreateNodeStorage.ts';

/** One SQLite engine, database, and VFS for this worker's persistent identity. */
export async function openWaSqliteNodeStorage(props: {
  namespace: string;
  developmentStorageId?: string | null | undefined;
  sqliteWasmUrl: string;
  create: boolean;
  recreate?: boolean | undefined;
  signal?: AbortSignal;
  onCleanupFailure?: (error: unknown) => void;
}) {
  const {
    namespace: baseNamespace,
    developmentStorageId,
    sqliteWasmUrl,
    create,
    recreate,
    signal,
    onCleanupFailure,
  } = props;
  const historyNamespace = (id: string) =>
    baseNamespace + '/history/' + encodeURIComponent(id);
  const namespace = developmentStorageId
    ? historyNamespace(developmentStorageId)
    : baseNamespace;
  const checkOpening = () => {
    if (signal?.aborted) throw makeZerospinError('node-tab-detached');
  };
  checkOpening();
  if (
    !create &&
    !(await indexedDB.databases()).some(db => db.name === namespace)
  ) {
    throw new Error('Node storage is missing');
  }
  let serial: Promise<unknown> = Promise.resolve();
  const serialized = <T>(work: () => T | PromiseLike<T>) => {
    const result = serial.then(work);
    serial = result.catch(() => undefined);
    return result;
  };
  let module: Awaited<ReturnType<typeof SQLiteESMFactory>>;
  let sqlite: ReturnType<typeof SQLite.Factory>;
  try {
    module = await SQLiteESMFactory({ locateFile: () => sqliteWasmUrl });
    sqlite = SQLite.Factory(module);
  } catch (error) {
    throw ensureZerospinError({
      code: 'node-storage-runtime-unavailable',
      error,
    });
  }
  checkOpening();
  if (recreate) {
    await recreateNodeStorage(namespace, checkOpening, onCleanupFailure);
  }
  let vfs = await IDBBatchAtomicVFS.create(namespace, module, {
    idbName: namespace,
  });
  vfs.mxPathname = 4096;
  let handle: number | undefined;
  try {
    checkOpening();
    sqlite.vfs_register(vfs, false);
    let opened = await serialized(() =>
      sqlite.open_v2(
        '/node',
        SQLite.SQLITE_OPEN_READWRITE | (create ? SQLite.SQLITE_OPEN_CREATE : 0),
        namespace,
      ),
    );
    handle = opened;
    checkOpening();
    await serialized(() => sqlite.exec(opened, 'PRAGMA synchronous=FULL'));
    let closing = false;
    let closed: Promise<void> | undefined;
    function execute(
      query: string,
      parameters: ISqliteStatementParameter[],
      rowMode?: 'array',
    ): Promise<unknown[][]>;
    function execute(
      query: string,
      parameters: ISqliteStatementParameter[],
      rowMode: 'object',
    ): Promise<Record<string, unknown>[]>;
    function execute(
      query: string,
      parameters: ISqliteStatementParameter[],
      rowMode?: 'array' | 'object',
    ): Promise<(unknown[] | Record<string, unknown>)[]>;
    function execute(
      query: string,
      parameters: ISqliteStatementParameter[],
      rowMode: 'array' | 'object' = 'array',
    ) {
      if (closing) {
        return Promise.reject(makeZerospinError('node-storage-closed'));
      }
      return serialized(async () => {
        const rows: (unknown[] | Record<string, unknown>)[] = [];
        for await (const statement of sqlite.statements(opened, query)) {
          sqlite.bind_collection(statement, parameters);
          while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) {
            const row = sqlite.row(statement);
            rows.push(
              rowMode === 'array'
                ? row
                : Object.fromEntries(
                    sqlite
                      .column_names(statement)
                      .map((name, index) => [name, row[index]]),
                  ),
            );
          }
        }
        return rows;
      });
    }

    function get(
      query: string,
      parameters: ISqliteStatementParameter[],
      rowMode?: 'array',
    ): Promise<unknown[] | undefined>;
    function get(
      query: string,
      parameters: ISqliteStatementParameter[],
      rowMode: 'object',
    ): Promise<Record<string, unknown> | undefined>;
    function get(
      query: string,
      parameters: ISqliteStatementParameter[],
      rowMode?: 'array' | 'object',
    ): Promise<unknown[] | Record<string, unknown> | undefined>;
    async function get(
      query: string,
      parameters: ISqliteStatementParameter[],
      rowMode?: 'array' | 'object',
    ) {
      return (await execute(query, parameters, rowMode))[0];
    }

    const executors = {
      all: execute,
      get,
      run: async (query: string, parameters: ISqliteStatementParameter[]) => {
        await execute(query, parameters);
      },
    };
    const db = drizzle(executors, { codecs: durableSQLiteCodecs });
    await db.run(sql`PRAGMA foreign_keys = ON`);
    checkOpening();
    let recreationFailure: unknown;
    const recreateDatabase = async (assertCurrent: () => void) => {
      if (closing) throw makeZerospinError('node-storage-closed');
      closing = true;
      await serialized(async () => {
        try {
          assertCurrent();
          await sqlite.close(opened);
          handle = undefined;
          await vfs.close();
          await recreateNodeStorage(namespace, assertCurrent, onCleanupFailure);
          assertCurrent();
          vfs = await IDBBatchAtomicVFS.create(namespace, module, {
            idbName: namespace,
          });
          vfs.mxPathname = 4096;
          sqlite.vfs_register(vfs, false);
          opened = await sqlite.open_v2(
            '/node',
            SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
            namespace,
          );
          handle = opened;
          await sqlite.exec(
            opened,
            'PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON',
          );
          assertCurrent();
          closing = false;
        } catch (error) {
          recreationFailure = error;
          throw error;
        }
      });
    };
    return {
      db,
      recreate: recreateDatabase,
      withRelations: <R extends AnyRelations>(relations: R) =>
        drizzle(executors, { relations, codecs: durableSQLiteCodecs }),
      close: () => {
        if (closed !== undefined) return closed;
        closing = true;
        closed = serialized(async () => {
          let failure: unknown;
          let failed = false;
          try {
            if (handle !== undefined) await sqlite.close(handle);
          } catch (error) {
            failed = true;
            failure = error;
          }
          try {
            await vfs.close();
          } catch (error) {
            if (!failed) {
              failed = true;
              failure = error;
            }
          }
          if (failed) return Promise.reject(failure);
          if (recreationFailure !== undefined) {
            return Promise.reject(recreationFailure);
          }
        });
        return closed;
      },
    };
  } catch (error) {
    const opened = handle;
    if (opened !== undefined) {
      await Promise.resolve()
        .then(() => sqlite.close(opened))
        .catch(cleanupError => onCleanupFailure?.(cleanupError));
    }
    await Promise.resolve()
      .then(() => vfs.close())
      .catch(cleanupError => onCleanupFailure?.(cleanupError));
    throw error;
  }
}
