import { type IAnyError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { provisionDb } from '../../provisionDb/provisionDb.ts';
import type { IDbConfig, ISqliteDrizzleDb } from '../../types.ts';

import { makeInMemoryWasmSqliteDb } from './makeInMemoryWasmSqliteDb/makeInMemoryWasmSqliteDb.ts';

/** Builds an in-memory Drizzle db and runs `provisionDb` once. Each call uses a new empty DB. */
export const makeProvisionedInMemoryWasmSqliteDb = Effect.fn(
  'makeProvisionedInMemoryWasmSqliteDb',
)(function* <CONFIG extends IDbConfig>(props: {
  dbConfig: CONFIG;
}): Effect.fn.Return<ISqliteDrizzleDb<CONFIG>, IAnyError, never> {
  const { dbConfig } = props;
  const db = yield* makeInMemoryWasmSqliteDb({ dbConfig });
  yield* provisionDb({ db, definition: dbConfig.definition });
  return db;
});
