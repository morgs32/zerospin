import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { makeServiceSessionLockKey } from '@zerospin/core/serviceSession/make/makeServiceSessionLockKey';
import { makeServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import { serviceSessionRepoTables } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { and, asc, isNull } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

/** The session Scope owns the replica client, declared schema and pending-original query. */
export const openServiceReplica = Effect.fn('openServiceReplica')(function* <
  D extends IServiceSessionDefinition,
  SERVICES,
>(props: {
  session: IServiceSession<D, D['models'], SERVICES>;
  signal: AbortSignal;
}) {
  const { session, signal } = props;
  const definition = session.sessionDefinition;
  const models = session.models;
  const lock = makeServiceSessionSpec(definition).serviceSessionLock;
  const serviceSessionLockKey = yield* makeServiceSessionLockKey(lock);
  const dbConfig = makeResourceDbConfig({
    models,
    otherTables: serviceSessionRepoTables,
  });
  const client = yield* Effect.acquireRelease(
    Effect.promise(() => makeInMemorySQLite3()),
    client => Effect.sync(() => client.sqlite3.close(client.db)),
  );
  if (signal.aborted) return yield* Effect.interrupt;
  const db = yield* Effect.sync(() => makeSqliteDrizzle(client, dbConfig));
  yield* provisionDb({ db, definition: dbConfig.definition });
  const readPending = (unretainedOnly = false) =>
    db
      .select()
      .from(dbConfig.schema.commands)
      .where(
        and(
          isNull(dbConfig.schema.commands.serviceIndex),
          ...(unretainedOnly ? [isNull(dbConfig.schema.commands.nodeId)] : []),
        ),
      )
      .orderBy(asc(dbConfig.schema.commands.sessionIndex))
      .all();
  return {
    definition,
    models,
    lock,
    dbConfig,
    db,
    readPending,
    serviceSessionLockKey,
  };
});
