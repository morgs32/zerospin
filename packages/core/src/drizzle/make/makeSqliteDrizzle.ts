import { durableSQLiteCodecs } from 'drizzle-orm/durable-sqlite/codecs';
import { entityKind } from 'drizzle-orm/entity';
import { DefaultLogger, type Logger } from 'drizzle-orm/logger';
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations';
import { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core/async/db';
import { SQLiteSyncRelationalQuery } from 'drizzle-orm/sqlite-core/async/query';
import { SQLiteDialect } from 'drizzle-orm/sqlite-core/dialect';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core/table';
import type { DrizzleSQLiteConfig } from 'drizzle-orm/sqlite-core/utils';
import { mapValues } from 'es-toolkit';

import type {
  IDbConfig,
  IDbConfigRelations,
  ISqliteClient,
  ISqliteDrizzleDb,
  ISqliteRunResult,
} from '../types.ts';
import { SqliteSession } from '../SqliteSession.ts';
import { SqliteRelationalQueryBuilder, type ISqliteQueries } from '../SqliteRelationalQueryBuilder.ts';

export class SqliteDatabase<
  TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteAsyncDatabase<'sync', ISqliteRunResult, TRelations> {
  static override readonly [entityKind]: string = 'SqliteDatabase';

  declare query: ISqliteQueries<TRelations>;

  constructor(...args: ConstructorParameters<typeof SQLiteAsyncDatabase<'sync', ISqliteRunResult, TRelations>>) {
    super(...args);
    const [, dialect, session, relations, forbidJsonb] = args;
    this.query = mapValues(relations, relation => new SqliteRelationalQueryBuilder(
      'sync', relations, relation.table as SQLiteTable, relation, dialect, session, forbidJsonb, SQLiteSyncRelationalQuery,
    ));
  }
}

export function makeSqliteDrizzle<CONFIG extends IDbConfig>(
  client: ISqliteClient,
  config: CONFIG &
    Omit<
      DrizzleSQLiteConfig<IDbConfigRelations<CONFIG>>,
      'relations'
    >,
): ISqliteDrizzleDb<CONFIG> {
  client.sqlite3.exec(client.db, 'PRAGMA foreign_keys = ON;');

  const dialect = new SQLiteDialect({ codecs: durableSQLiteCodecs });

  let logger: Logger | undefined;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }

  const sessionOptions = logger === undefined ? {} : { logger };
  const relations = config.relations;

  const database = new SqliteDatabase<IDbConfigRelations<CONFIG>>(
    'sync',
    dialect,
    new SqliteSession<IDbConfigRelations<CONFIG>>(client, dialect, relations, sessionOptions),
    relations,
    true,
  );

  return Object.assign(database, { $client: client });
}
