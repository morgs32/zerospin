import { entityKind } from 'drizzle-orm/entity';
import { NoopLogger, type Logger } from 'drizzle-orm/logger';
import type { AnyRelations } from 'drizzle-orm/relations';
import {
  SQLiteAsyncPreparedQuery,
  SQLiteAsyncSession,
  SQLiteAsyncTransaction,
} from 'drizzle-orm/sqlite-core/async/session';
import type { SQLiteDialect } from 'drizzle-orm/sqlite-core/dialect';
import type {
  SQLiteExecuteMethod,
  SQLiteTransactionConfig,
} from 'drizzle-orm/sqlite-core/session';
import { sql, type Query } from 'drizzle-orm/sql/sql';
import type { DrizzleTypeError } from 'drizzle-orm/utils';

import { executeStatementRows } from './executeStatementRows.ts';
import {
  makeCommitObservation,
  type ICommitObservation,
} from './makeCommitObservation.ts';
import type { ISqliteClient, ISqliteRunResult } from './types.ts';

type ISqliteSessionOptions = {
  logger?: Logger;
};

type IPreparedQueryConfig = {
  type: 'sync';
  run: ISqliteRunResult;
  all: unknown;
  get: unknown;
  values: unknown[][];
  execute: unknown;
};

export class SqliteSession<
  TRelations extends AnyRelations,
> extends SQLiteAsyncSession<'sync', ISqliteRunResult, TRelations> {
  static override readonly [entityKind]: string = 'SqliteSession';

  private readonly logger: Logger;
  private readonly observation: ICommitObservation;

  constructor(
    private readonly client: ISqliteClient,
    dialect: SQLiteDialect,
    private readonly relations: TRelations,
    options: ISqliteSessionOptions = {},
  ) {
    super(dialect, 'sync');
    this.logger = options.logger ?? new NoopLogger();
    this.observation = makeCommitObservation(client);
  }

  override prepareQuery(
    query: Query,
    mode: 'arrays' | 'objects' | 'raw',
    _prepare: boolean,
    executeMethod?: SQLiteExecuteMethod,
    mapper?: (rows: unknown[]) => unknown,
  ): SQLiteAsyncPreparedQuery<IPreparedQueryConfig> {
    return new SQLiteAsyncPreparedQuery<IPreparedQueryConfig>(
      'sync',
      executeMethod,
      {
        all: parameters =>
          executeStatementRows({
            client: this.client,
            observation: this.observation,
            sql: query.sql,
            parameters,
            rowMode: mode === 'arrays' ? 'arrays' : 'objects',
          }).rows,
        get: parameters =>
          executeStatementRows({
            client: this.client,
            observation: this.observation,
            sql: query.sql,
            parameters,
            rowMode: mode === 'arrays' ? 'arrays' : 'objects',
          }).rows[0],
        run: parameters => {
          const { changes } = executeStatementRows({
            client: this.client,
            observation: this.observation,
            sql: query.sql,
            parameters,
            rowMode: 'arrays',
          });
          return { changes };
        },
      },
      query,
      mapper,
      mode,
      this.logger,
      undefined,
    );
  }

  override transaction<T>(
    transaction: (tx: SqliteTransaction<TRelations>) => T,
    config: SQLiteTransactionConfig = {},
  ): T {
    const tx = new SqliteTransaction(
      'sync',
      this.dialect,
      this,
      this.relations,
      undefined,
      true,
    );
    this.run(sql.raw(`begin${config.behavior ? ` ${config.behavior}` : ''}`));
    this.observation.beginTransaction();

    try {
      const result = transaction(tx);
      this.run(sql`commit`);
      return result;
    } catch (cause) {
      this.run(sql`rollback`);
      throw cause;
    } finally {
      // COMMIT or ROLLBACK settles before isolated observers can run.
      this.observation.finishTransaction();
    }
  }
}

export class SqliteTransaction<
  TRelations extends AnyRelations,
> extends SQLiteAsyncTransaction<'sync', ISqliteRunResult, TRelations> {
  static override readonly [entityKind]: string = 'SqliteTransaction';

  constructor(
    resultType: 'sync',
    dialect: SQLiteDialect,
    session: SQLiteAsyncSession<'sync', ISqliteRunResult, TRelations>,
    relations: TRelations,
    nestedIndex: number | undefined,
    forbidJsonb: boolean | undefined,
  ) {
    super(resultType, dialect, session, relations, nestedIndex, forbidJsonb);
    this.transactionDialect = dialect;
    this.transactionSession = session;
    this.transactionRelations = relations;
  }

  private readonly transactionDialect: SQLiteDialect;
  private readonly transactionSession: SQLiteAsyncSession<
    'sync',
    ISqliteRunResult,
    TRelations
  >;
  private readonly transactionRelations: TRelations;

  override transaction<T>(
    transaction: (
      tx: SqliteTransaction<TRelations>,
    ) => T extends Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any -- Promise<any> vs Promise<unknown> are not equivalent in conditional types; unknown breaks Drizzle's assignability
      ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
      : T,
  ): T {
    const savepointName = `sp${this.nestedIndex + 1}`;
    const tx = new SqliteTransaction(
      'sync',
      this.transactionDialect,
      this.transactionSession,
      this.transactionRelations,
      this.nestedIndex + 1,
      true,
    );

    tx.run(sql.raw(`savepoint ${savepointName}`));
    let result: T;
    try {
      result = transaction(tx) as T;
      tx.run(sql.raw(`release savepoint ${savepointName}`));
    } catch (cause) {
      tx.run(sql.raw(`rollback to savepoint ${savepointName}`));
      tx.run(sql.raw(`release savepoint ${savepointName}`));
      throw cause;
    }
    return result;
  }
}
