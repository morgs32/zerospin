import type {
  AnyRelations,
  BuildQueryResult,
  DBQueryConfig,
  TableRelationalConfig,
  TablesRelationalConfig,
} from 'drizzle-orm/relations';
import {
  SQLiteSyncRelationalQuery,
  type SQLiteAsyncRelationalQueryHKT,
} from 'drizzle-orm/sqlite-core/async/query';
import { RelationalQueryBuilder } from 'drizzle-orm/sqlite-core/query-builders/query';
import type { KnownKeysOnly } from 'drizzle-orm/utils';

export type ISqliteQueries<TRelations extends AnyRelations> = {
  [K in keyof TRelations]: SqliteRelationalQueryBuilder<
    TRelations,
    TRelations[K]
  >;
};

/** Require a row in the mapper shared by sync, awaited and prepared execution. */
class RequiredRelationalQuery<
  TResult,
> extends SQLiteSyncRelationalQuery<TResult> {
  // Drizzle's execution methods dispatch through this internal preparation hook.
  _prepare(prepare = false) {
    const { query, builtQuery } = this._toSQL();
    const mapRows = this.dialect.mapperGenerators.relationalRows({
      isFirst: true,
      parseJson: true,
      parseJsonIfString: false,
      rootJsonMappers: false,
      selection: query.selection,
      arrayModeRoot: true,
    });
    if (mapRows === undefined) {
      throw new Error('Required relational queries must have a row mapper');
    }
    return this.session.prepareQuery(
      builtQuery,
      'arrays',
      prepare,
      'all',
      rows => {
        const row = mapRows(rows);
        if (row === undefined) {
          throw new Error(`No row found for ${this.tableConfig.name}`);
        }
        return row;
      },
    );
  }
}

export class SqliteRelationalQueryBuilder<
  TSchema extends TablesRelationalConfig,
  TFields extends TableRelationalConfig,
> extends RelationalQueryBuilder<
  'sync',
  TSchema,
  TFields,
  SQLiteAsyncRelationalQueryHKT
> {
  private readonly queryArgs;

  constructor(
    ...args: ConstructorParameters<
      typeof RelationalQueryBuilder<
        'sync',
        TSchema,
        TFields,
        SQLiteAsyncRelationalQueryHKT
      >
    >
  ) {
    super(...args);
    this.queryArgs = args;
  }

  findFirstOrThrow<TConfig extends DBQueryConfig<'one', TSchema, TFields>>(
    config?: KnownKeysOnly<TConfig, DBQueryConfig<'one', TSchema, TFields>>,
  ) {
    const [mode, schema, table, tableConfig, dialect, session, forbidJsonb] =
      this.queryArgs;
    return new RequiredRelationalQuery<
      BuildQueryResult<TSchema, TFields, TConfig>
    >(
      mode,
      schema,
      table,
      tableConfig,
      dialect,
      session,
      // Drizzle erases schema-specific configuration at its query constructor.
      config === undefined ? true : (config as DBQueryConfig<'one'>),
      'first',
      forbidJsonb,
    );
  }
}
