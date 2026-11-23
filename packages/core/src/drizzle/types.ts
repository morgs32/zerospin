import type {
  IAnyDrizzleSchemas,
  IReference,
  INullPart,
  IAnyTables,
  IDrizzleSchema,
} from '@zerospin/shapes';
import type { AnyRelations, Many, One } from 'drizzle-orm';
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core/async/db';
import type { SQLiteSyncRelationalQuery } from 'drizzle-orm/sqlite-core/async/query';
import type { AnySQLiteAsyncSelect } from 'drizzle-orm/sqlite-core/async/select';
import type { SQLiteAsyncTransaction } from 'drizzle-orm/sqlite-core/async/session';
import type { Brand } from 'effect';
import type { UnionToIntersection } from 'type-fest';

import type { IAnyModels, IModel } from '../models/types.ts';
import type { ISqliteQueries } from './SqliteRelationalQueryBuilder.ts';
import type { IBoundDatabaseDefinition } from './definition/bindDatabaseDefinition.ts';
import type { ISqliteTableDefinition } from './definition/compileSqliteTableDefinition.ts';

export type ISqliteStatementParameter = number | string | Uint8Array | bigint | null;

/** Synchronous SQLite C API boundary shared by native and browser engines. */
export type ISqliteClient = {
  db: number;
  sqlite3: {
    exec(db: number, sql: string): unknown;
    statements(db: number, sql: string, options?: { unscoped?: boolean }): readonly number[];
    bind_collection(statement: number, parameters: ISqliteStatementParameter[]): unknown;
    step(statement: number): number;
    row(statement: number): unknown[];
    column_names(statement: number): string[];
    finalize(statement: number): number;
    changes(db: number): number;
    close(db: number): unknown;
  };
  /** Execute one synchronous read and collect its physical SQLite dependencies. */
  captureReadTables<T>(read: () => T): { result: T; tables: ReadonlySet<string> };
  subscribeToTableChanges(listener: (names: ReadonlySet<string>) => void): () => void;
  flushTableChanges(restoredTableNames?: ReadonlySet<string>): void;
};

export type ISqliteRunResult = {
  changes: number;
};

type INonEmptyObject<T> = keyof T extends never ? never : T;

type IParentModelName<
  TABLES extends IAnyTables,
  PARENT_KEY extends keyof TABLES,
> = TABLES[PARENT_KEY]['name'];

type IInverseRecordForSourceModel<
  TABLES extends IAnyTables,
  PARENT_KEY extends keyof TABLES & string,
  SOURCE_KEY extends keyof TABLES & string,
> =
  UnionToIntersection<
    {
      [PROPERTY in keyof TABLES[SOURCE_KEY]['shape']]: TABLES[SOURCE_KEY]['shape'][PROPERTY] extends infer REF extends
        { references: IReference; primaryKey?: boolean; unique?: boolean }
        ? REF['references']['tableName'] extends IParentModelName<TABLES, PARENT_KEY>
          ? Record<
              REF['references']['inverse'],
              REF extends { primaryKey: true } | { unique: true }
                ? One<SOURCE_KEY, true>
                : Many<SOURCE_KEY>
            >
          : never
        : never;
    }[keyof TABLES[SOURCE_KEY]['shape']]
  > extends infer INTERSECTED_INVERSE_RELATIONS
    ? INonEmptyObject<INTERSECTED_INVERSE_RELATIONS>
    : never;

type ISourceModelKeysWithRefTo<
  TABLES extends IAnyTables,
  PARENT_KEY extends keyof TABLES & string,
> = {
  [SOURCE_KEY in keyof TABLES]: IInverseRecordForSourceModel<
    TABLES,
    PARENT_KEY,
    Extract<SOURCE_KEY, keyof TABLES & string>
  > extends never
    ? never
    : SOURCE_KEY;
}[keyof TABLES];

type IInverseRelationsMapForParentModel<
  TABLES extends IAnyTables,
  PARENT_KEY extends keyof TABLES & string,
> = [ISourceModelKeysWithRefTo<TABLES, PARENT_KEY>] extends [never]
  ? {}
  : UnionToIntersection<
      ISourceModelKeysWithRefTo<TABLES, PARENT_KEY> extends infer SOURCE_KEY
        ? SOURCE_KEY extends keyof TABLES & string
          ? IInverseRecordForSourceModel<TABLES, PARENT_KEY, SOURCE_KEY>
          : never
        : never
    >;

export type IInferDrizzleSchemaFromTables<TABLES extends IAnyTables, DECODED extends boolean = false> = {
  [K in keyof TABLES]: IDrizzleSchema<
    Extract<TABLES[K]['name'], string>,
    TABLES[K]['shape'],
    DECODED
  >;
};

export type IResourceDrizzleSchemasFromModels<MODELS extends IAnyModels> = {
  [K in keyof MODELS]: IDrizzleSchema<
    MODELS[K]['table']['name'],
    MODELS[K]['table']['shape']
  >;
};

export type IFullDrizzleSchema<
  MODELS extends IAnyModels,
  OTHER_TABLES extends IAnyTables,
> = IResourceDrizzleSchemasFromModels<MODELS> &
  IInferDrizzleSchemaFromTables<OTHER_TABLES>;

export type IDrizzleRelationsFromModels<
  MODELS extends Readonly<Record<string, { readonly table: IModel['table'] }>>,
  TABLES extends IAnyTables = {
    [MODEL_KEY in keyof MODELS]: MODELS[MODEL_KEY]['table'];
  },
  DECODED extends boolean = true,
> = {
  [TABLE_KEY in keyof TABLES & string]: {
    table: IDrizzleSchema<
      TABLES[TABLE_KEY]['name'],
      TABLES[TABLE_KEY]['shape'],
      DECODED
    >;
    name: TABLE_KEY;
    relations: {
      [PROPERTY in keyof TABLES[TABLE_KEY]['shape'] as TABLES[TABLE_KEY]['shape'][PROPERTY] extends { references: IReference }
        ? TABLES[TABLE_KEY]['shape'][PROPERTY]['references']['relation']
        : never]: TABLES[TABLE_KEY]['shape'][PROPERTY] extends { references: IReference }
        ? One<
            {
              [TARGET_TABLE_KEY in keyof TABLES &
                string]: TABLES[TARGET_TABLE_KEY]['name'] extends TABLES[TABLE_KEY]['shape'][PROPERTY]['references']['tableName']
                ? TARGET_TABLE_KEY
                : never;
            }[keyof TABLES & string],
            null extends INullPart<TABLES[TABLE_KEY]['shape'][PROPERTY]> ? true : false
          >
        : never;
    } & IInverseRelationsMapForParentModel<TABLES, TABLE_KEY>;
  };
};

export type IDatabaseDefinition = IBoundDatabaseDefinition & Readonly<{ provisioning: readonly ISqliteTableDefinition[] }>;

export type IDbConfig<
  SCHEMA extends IAnyDrizzleSchemas = IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations = AnyRelations,
  TABLES extends IAnyTables = IAnyTables,
> = Readonly<{
  tables: TABLES;
  schema: SCHEMA;
  relations: RELATIONS;
  definition: IDatabaseDefinition;
}>;

export type IDbConfigSchema<CONFIG extends IDbConfig> = CONFIG['schema'];

export type IDbConfigRelations<CONFIG extends IDbConfig> = CONFIG['relations'];

export type IResourceDbConfig<
  MODELS extends IAnyModels = IAnyModels,
  OTHER_TABLES extends IAnyTables = IAnyTables,
> = IDbConfig<
  IFullDrizzleSchema<MODELS, OTHER_TABLES>,
  IDrizzleRelationsFromModels<
    MODELS,
    {
      [MODEL_KEY in keyof MODELS]: MODELS[MODEL_KEY]['table'];
    } & OTHER_TABLES
  >,
  { [MODEL_KEY in keyof MODELS]: MODELS[MODEL_KEY]['table'] } & OTHER_TABLES
> &
  Brand.Brand<'ResourceDbConfig'>;

export type ISyncSQLiteDatabase<
  _SCHEMA extends IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations,
> = SQLiteAsyncDatabase<'sync', unknown, RELATIONS>;

// TODO: Make an IAnyDbConfig
export type IDb<
  // oxlint-disable-next-line typescript/no-explicit-any -- erased repo DB handles need the historical widest Drizzle config default.
  CONFIG extends IDbConfig = IDbConfig<any, any>,
> = ISyncSQLiteDatabase<IDbConfigSchema<CONFIG>, IDbConfigRelations<CONFIG>>;

// TODO: Make an IAnyResourceDbConfig?
export type IResourceDb<
  // oxlint-disable-next-line typescript/no-explicit-any -- resource DB default must remain assignable from generically constructed Drizzle configs.
  CONFIG extends IResourceDbConfig = IResourceDbConfig<any, any>,
> = IDb<CONFIG> & Brand.Brand<'ResourceDb'>;

/** Synchronous Drizzle transaction supplied by makeTx or an explicit savepoint. */
type IDrizzleTransaction<CONFIG extends IDbConfig> = SQLiteAsyncTransaction<
  'sync',
  unknown,
  IDbConfigRelations<CONFIG>
>;

// oxlint-disable-next-line typescript/no-explicit-any -- transaction defaults mirror IDb's erased Drizzle config surface.
export type ITx<CONFIG extends IDbConfig = IDbConfig<any, any>> =
  IDrizzleTransaction<CONFIG>;

// oxlint-disable-next-line typescript/no-explicit-any -- session DB defaults mirror IDb's erased Drizzle config surface.
export type ISqliteDrizzleDb<CONFIG extends IDbConfig = IDbConfig<any, any>> =
  IDb<CONFIG> & {
    query: ISqliteQueries<IDbConfigRelations<CONFIG>>;
    $client: ISqliteClient;
  };

/** Model-only relational capability passed to authored session queries. */
export type IModelQueryDb<MODELS extends IAnyModels> = Pick<
  ISqliteDrizzleDb<
    IDbConfig<
      IResourceDrizzleSchemasFromModels<MODELS>,
      IDrizzleRelationsFromModels<MODELS>
    >
  >,
  'query' | '$client'
>;

/** Relational/select queries `useLiveQuery` can run against a sync wa-sqlite Drizzle db. */
export type ILiveRelationalQuery =
  | AnySQLiteAsyncSelect
  // oxlint-disable-next-line typescript/no-explicit-any -- Drizzle relational query union erases row types
  | SQLiteSyncRelationalQuery<any>;
