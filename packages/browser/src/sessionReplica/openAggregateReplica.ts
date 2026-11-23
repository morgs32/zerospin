import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  ISessionId,
} from '@zerospin/core/aggregateSession/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import * as Effect from 'effect/Effect';

import { makeAggregatePendingReader } from './makeAggregatePendingReader.ts';

/** The session Scope owns the replica client, declared schema and pending-original query. */
export const openAggregateReplica = Effect.fn('openAggregateReplica')(
  function* <D extends IAggregateSessionDefinition>(props: {
    session: IAggregateSession<D>;
    sessionId: ISessionId;
    signal: AbortSignal;
  }) {
    const { session, signal } = props;
    const definition = session.sessionDefinition;
    const models: D['models'] = definition.models;
    const lock = makeAggregateSessionSpec(definition).aggregateSessionLock;
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: aggregateSessionRepoDbConfig.tables,
    });
    const client = yield* Effect.acquireRelease(
      Effect.promise(() => makeInMemorySQLite3()),
      client => Effect.sync(() => client.sqlite3.close(client.db)),
    );
    if (signal.aborted) return yield* Effect.interrupt;
    const db = yield* Effect.sync(() => makeSqliteDrizzle(client, dbConfig));
    yield* provisionDb({ db, definition: dbConfig.definition });
    const readPending = makeAggregatePendingReader({ db });
    return { definition, models, lock, dbConfig, db, readPending };
  },
);
