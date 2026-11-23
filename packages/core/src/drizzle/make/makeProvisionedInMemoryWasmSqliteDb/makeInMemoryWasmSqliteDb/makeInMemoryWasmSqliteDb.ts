import { type IAnyError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IDbConfig, ISqliteDrizzleDb } from '../../../types.ts';
import { makeInMemorySQLite3 } from '../../makeInMemorySQLite3/makeInMemorySQLite3.ts';
import { makeSqliteDrizzle } from '../../makeSqliteDrizzle.ts';

export const makeInMemoryWasmSqliteDb = Effect.fn('makeInMemoryWasmSqliteDb')(
  function* <CONFIG extends IDbConfig>(props: {
    dbConfig: CONFIG;
  }): Effect.fn.Return<ISqliteDrizzleDb<CONFIG>, IAnyError, never> {
    yield* Effect.void;
    const { dbConfig } = props;
    const client = yield* Effect.promise(() => makeInMemorySQLite3());
    // TODO: ({ client, dbConfig })
    return makeSqliteDrizzle(client, dbConfig);
  },
);
