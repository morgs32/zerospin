import { readFileSync } from 'node:fs';

import SQLiteESMFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';
import {
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import type * as Scope from 'effect/Scope';

import { makeInMemorySQLite3 } from '../../drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts';
import { makeSqliteDrizzle } from '../../drizzle/make/makeSqliteDrizzle.ts';
import { provisionDb } from '../../drizzle/provisionDb/provisionDb.ts';
import type { IDb, IDbConfig } from '../../drizzle/types.ts';

/** Open a fresh production-schema database and close it with the test scope. */
export const openHarnessDb = <CONFIG extends IDbConfig>(
  config: CONFIG,
): Effect.Effect<IDb<CONFIG>, IAnyError, Scope.Scope> =>
  Effect.gen(function* () {
    const client = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => {
          const wasmBinary = readFileSync(
            new URL(
              import.meta.resolve('@livestore/wa-sqlite/dist/wa-sqlite.wasm'),
            ),
          );
          return makeInMemorySQLite3(() => SQLiteESMFactory({ wasmBinary }));
        },
        catch: cause =>
          makeZerospinError({
            code: 'system-harness-storage-open-failed',
            message: 'Could not open the in-memory harness database.',
            cause: prettyUnknownFailure(cause),
          }),
      }),
      acquired => Effect.sync(() => acquired.sqlite3.close(acquired.db)),
    );
    const db = makeSqliteDrizzle(client, config);
    yield* provisionDb({ db, definition: config.definition });
    return db;
  });
