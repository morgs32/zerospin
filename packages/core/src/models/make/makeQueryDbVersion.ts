import {
  fillPlaceholders,
  getColumns,
  is,
  Param,
  Placeholder,
  SQL,
  Table,
  type Column,
  type Query,
  type SQLChunk,
} from 'drizzle-orm';
import { durableSQLiteCodecs } from 'drizzle-orm/durable-sqlite/codecs';
import { NoopLogger } from 'drizzle-orm/logger';
import type {
  TableRelationalConfig,
  TablesRelationalConfig,
} from 'drizzle-orm/relations';
import { SQLiteAsyncPreparedQuery } from 'drizzle-orm/sqlite-core/async/session';
import { SQLiteDialect } from 'drizzle-orm/sqlite-core/dialect';
import {
  RelationalQueryBuilder,
  SQLiteRelationalQuery,
  type SQLiteRelationalQueryHKTBase,
} from 'drizzle-orm/sqlite-core/query-builders/query';
import { SQLiteSession } from 'drizzle-orm/sqlite-core/session';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { makeResourceDbConfig } from '../../drizzle/make/makeDbConfig/makeDbConfig.ts';
import type { IDb, IDbConfig, IResourceDbConfig } from '../../drizzle/types.ts';
import type { IClaimsSchema } from '../../identity/types.ts';
import {
  captureSelectionDefinition,
  trustedIdentityEncoder,
} from '../captureSelectionDefinition.ts';
import { encodeRowAsResource } from '../encodeRowAsResource.ts';
import { assertSelectionQueryModels } from '../makeSelection.ts';
import {
  compileReadQuery,
  normalizeReadConfig,
} from '../reads/compileReadQuery.ts';
import type { IReadQuery } from '../reads/ReadQuerySchema.ts';
import type { SelectionDefinitionSchema } from '../SelectionDefinitionSchema.ts';
import type { ISelectionQuery } from '../SelectionQuerySchema.ts';
import type { IAnyModels, IInferEncodedResource, IModel } from '../types.ts';

class AuthoringSession extends SQLiteSession {
  readonly identityEncoders = new Map<Column, Column['mapToDriverValue']>();

  constructor(
    dialect: SQLiteDialect,
    readonly models: IAnyModels,
    readonly config: IDbConfig,
  ) {
    super(dialect);
    const capture = (table: unknown) => {
      if (!is(table, Table)) return;
      for (const column of Object.values(getColumns(table))) {
        this.identityEncoders.set(column, column.mapToDriverValue);
      }
    };
    mapValues(config.schema, capture);
    mapValues(config.relations, relation => capture(relation.table));
  }

  prepareQuery(): never {
    throw new Error('Query database definitions cannot execute selections');
  }
}
export interface IQuerySelectionHKT extends SQLiteRelationalQueryHKTBase {
  _type: QuerySelection<this['result']>;
}

function validateSelectionFields(
  schema: TablesRelationalConfig,
  table: TableRelationalConfig,
  config: true | { where?: unknown; orderBy?: unknown },
): void {
  if (config === true) return;
  const fields = getColumns(table.table);
  if (typeof config.orderBy === 'object' && config.orderBy !== null) {
    const orderBy = Schema.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.Unknown),
    )(config.orderBy);
    mapValues(orderBy, (_direction, field) => {
      if (!Object.hasOwn(fields, field)) {
        throw new Error(`Invalid selection order ${table.name}.${field}`);
      }
    });
  }
  if (config.where === undefined) return;
  const where = Schema.decodeUnknownSync(
    Schema.Record(Schema.String, Schema.Unknown),
  )(config.where);
  mapValues(where, (value, field) => {
    if (field === 'RAW' || Object.hasOwn(fields, field)) return;
    if (field === 'AND' || field === 'OR' || field === 'NOT') {
      for (const branch of Array.isArray(value) ? value : [value]) {
        validateSelectionFields(schema, table, { where: branch });
      }
      return;
    }
    const relation = table.relations[field];
    const relatedTable = relation && schema[relation.targetTableName];
    if (relatedTable === undefined) {
      throw new Error(`Unknown selection filter ${table.name}.${field}`);
    }
    if (typeof value === 'object' && value !== null) {
      validateSelectionFields(schema, relatedTable, { where: value });
    }
  });
}

/** Evaluate authored SQL callbacks once, using Drizzle's actual table aliases. */
function snapshotSelectionCallbacks(props: {
  config: unknown;
  schema: TablesRelationalConfig;
  table: TableRelationalConfig;
}) {
  const aliases = new Map<Table, { table: Table; scope: readonly string[] }>();
  const ancestors = new Set<object>();
  function snapshot(
    value: unknown,
    table: TableRelationalConfig,
    scope: readonly string[],
  ): unknown {
    if (typeof value !== 'object' || value === null) return value;
    if (ancestors.has(value)) {
      throw new Error(
        'Selection definitions require serializable, acyclic options',
      );
    }
    if (is(value, Param)) {
      if (is(value.value, Placeholder)) {
        return new Param(value.value, value.encoder, value.codec);
      }
      let called = false;
      let encoded: unknown;
      const originalEncoder = value.encoder;
      const encoder = new Proxy(
        { mapToDriverValue: originalEncoder.mapToDriverValue },
        {
          get(_target, key) {
            if (key !== 'mapToDriverValue') {
              return Reflect.get(originalEncoder, key, originalEncoder);
            }
            return (input: unknown) => {
              if (!called) {
                const result = originalEncoder.mapToDriverValue(input);
                encoded = is(result, SQL)
                  ? snapshot(result, table, scope)
                  : result;
                called = true;
              }
              return encoded;
            };
          },
          getPrototypeOf() {
            return Object.getPrototypeOf(originalEncoder);
          },
        },
      );
      return new Param(
        is(value.value, SQL)
          ? snapshot(value.value, table, scope)
          : value.value,
        encoder,
        value.codec,
      );
    }
    if (is(value, SQL)) {
      ancestors.add(value);
      try {
        const chunks = value.queryChunks.map(
          chunk => snapshot(chunk, table, scope) as SQLChunk,
        );
        return Object.assign(new SQL(chunks), value, { queryChunks: chunks });
      } finally {
        ancestors.delete(value);
      }
    }
    if (is(value, SQL.Aliased)) {
      const expression = snapshot(value.sql, table, scope);
      if (!is(expression, SQL)) {
        throw new Error('Invalid aliased selection expression');
      }
      return Object.assign(
        new SQL.Aliased(expression, value.fieldAlias),
        value,
        { sql: expression },
      );
    }
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      return value;
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return value.map(item => snapshot(item, table, scope));
      }
      const record = Schema.decodeUnknownSync(
        Schema.Record(Schema.String, Schema.Unknown),
      )(value);
      return mapValues(record, (item, key) => {
        const relation = table.relations[key];
        const child =
          relation === undefined
            ? table
            : props.schema[relation.targetTableName];
        const childScope = relation === undefined ? scope : [...scope, key];
        if (child === undefined) {
          throw new Error(`Unknown selection relation ${key}`);
        }
        if (
          typeof item === 'function' &&
          (key === 'RAW' || key === 'orderBy')
        ) {
          let called = false;
          let result: unknown;
          return (...args: unknown[]) => {
            if (!called) {
              if (is(args[0], Table) && is(table.table, Table)) {
                if (!aliases.has(args[0])) {
                  aliases.set(args[0], { table: table.table, scope });
                }
              }
              result = snapshot(
                Reflect.apply(item, undefined, args),
                table,
                scope,
              );
              called = true;
            }
            return result;
          };
        }
        return snapshot(item, child, childScope);
      });
    } finally {
      ancestors.delete(value);
    }
  }
  return { config: snapshot(props.config, props.table, []), aliases };
}

function describeSelectionBindings(
  parameters: readonly unknown[],
  identity?: IClaimsSchema,
): ISelectionQuery['bindings'] {
  return parameters.map(parameter => {
    const placeholder = is(parameter, Placeholder)
      ? parameter
      : is(parameter, Param) && is(parameter.value, Placeholder)
        ? parameter.value
        : undefined;
    if (placeholder !== undefined) {
      if (
        identity === undefined ||
        !Object.hasOwn(identity.fields, placeholder['name'])
      ) {
        throw new Error(
          `Selection parameter ${placeholder['name']} is not an declared identity field`,
        );
      }
      return { type: 'identity', name: placeholder['name'] };
    }
    if (
      parameter === null ||
      typeof parameter === 'string' ||
      (typeof parameter === 'number' && Number.isFinite(parameter))
    ) {
      return { type: 'literal', value: parameter };
    }
    if (parameter instanceof Uint8Array) {
      return { type: 'bytes', value: [...parameter] };
    }
    if (typeof parameter === 'bigint') {
      return { type: 'bigint', value: String(parameter) };
    }
    throw new Error('Unsupported selection SQL parameter');
  });
}

/** Drizzle query construction is connection-free; only this adapter touches its compiler internals. */
export class QuerySelection<TResult = unknown> extends SQLiteRelationalQuery<
  IQuerySelectionHKT,
  TResult
> {
  private readonly queryMode: 'first' | 'many';
  private readonly queryResultKind: unknown;
  private readonly rootTable: ConstructorParameters<
    typeof SQLiteRelationalQuery
  >[2];

  constructor(...args: ConstructorParameters<typeof SQLiteRelationalQuery>) {
    super(...args);
    this.queryResultKind = args[0];
    this.queryMode = args[7];
    this.rootTable = args[2];
  }

  private validateSelectionShape(): void {
    if (
      this.queryMode !== 'many' ||
      (this.config !== true &&
        (this.config.columns !== undefined ||
          this.config.with !== undefined ||
          this.config.extras !== undefined))
    ) {
      throw new Error(
        'Selections must use findMany and return complete model rows without columns, with, or extras',
      );
    }
    validateSelectionFields(this.schema, this.tableConfig, this.config);
  }

  selectsAllRows(): boolean {
    return (
      this.queryMode === 'many' &&
      (this.config === true ||
        (this.config.where === undefined &&
          (!('limit' in this.config) || this.config.limit === undefined) &&
          this.config.offset === undefined))
    );
  }

  /** Resolve the query's declared model without evaluating its selection. */
  ownSourceModel() {
    const session = this.session;
    if (!(session instanceof AuthoringSession)) {
      throw new Error('Selections must originate from a query database');
    }
    const key = this.tableConfig.name;
    const model = session.models[key];
    if (model === undefined) {
      throw new Error(`Selection model ${key} is not declared`);
    }
    this.validateSelectionShape();
    return model;
  }

  /** Capture against the query's own canonical model context. */
  captureOwnSource() {
    const session = this.session;
    if (!(session instanceof AuthoringSession)) {
      throw new Error('Selections must originate from a query database');
    }
    return this.capture({
      db: { models: session.models, config: session.config, query: {} },
      model: this.ownSourceModel(),
      key: this.tableConfig.name,
    });
  }

  prepareRead(binding?: {
    models: IAnyModels;
    physicalTableNames: Readonly<Record<string, string>>;
  }) {
    const session = this.session;
    if (!(session instanceof AuthoringSession)) {
      throw new Error('Reads must originate from a query database');
    }
    const request: IReadQuery = {
      modelName: this.tableConfig.name,
      mode: this.queryMode,
      config: normalizeReadConfig({
        models: session.models,
        modelName: this.tableConfig.name,
        config: this.config,
      }),
      models: mapValues(session.models, model => ({
        modelName: model.modelName,
        version: model.version,
        columns: Object.keys(model.table.shape).sort(),
      })),
    };
    const compiled = compileReadQuery({
      models: binding?.models ?? session.models,
      query: request,
      ...(binding === undefined
        ? {}
        : { physicalTableNames: binding.physicalTableNames }),
    });
    const mapper = this.dialect.mapperGenerators.relationalRows({
      isFirst: this.queryMode === 'first',
      parseJson: true,
      parseJsonIfString: false,
      rootJsonMappers: false,
      selection: compiled.selection,
      arrayModeRoot: true,
    });
    return {
      request,
      builtQuery: compiled.builtQuery,
      compilerVersion: compiled.compilerVersion,
      layout: compiled.layout,
      mapRows(rows: unknown[][]): TResult {
        const unavailable = (): never => {
          throw new Error(
            'Read result mapping cannot execute a database query',
          );
        };
        return new SQLiteAsyncPreparedQuery<{
          type: 'sync';
          run: never;
          all: TResult;
          get: never;
          values: never;
          execute: TResult;
        }>(
          'sync',
          'all',
          {
            all: () => rows,
            run: unavailable,
            get: unavailable,
          },
          compiled.builtQuery,
          mapper,
          'arrays',
          new NoopLogger(),
          undefined,
        ).all();
      },
    };
  }

  private selectionSession(db: IAnyQueryDbVersion, key: string) {
    const session = this.session;
    if (!(session instanceof AuthoringSession)) {
      throw new Error('Selections must originate from a query database');
    }
    if (
      this.schema !== db.config.relations ||
      this.rootTable !== db.config.relations[key]?.table
    ) {
      throw new Error(`Selection ${key} must query its query database model`);
    }
    this.validateSelectionShape();
    return session;
  }

  /** Prepare an Agent selection using the structured options that will actually execute. */
  prepareStructuredSelection(props: {
    db: IAnyQueryDbVersion;
    model: IModel;
    key: string;
  }) {
    const { db, model, key } = props;
    const session = this.selectionSession(db, key);
    const read = this.prepareRead();
    const { config } = read.request;
    const orderBy = config.orderBy;
    const definition = captureSelectionDefinition({
      // Sort priority matters even though selection facts sort record keys.
      config:
        typeof orderBy === 'object' && orderBy !== null
          ? { ...config, orderBy: Object.entries(orderBy) }
          : config,
      table: this.tableConfig,
      relations: this.schema,
      schema: db.config.schema,
      identityEncoders: session.identityEncoders,
      identityFields: [],
    });
    return {
      request: read.request,
      definition,
      buildSelection(statement: Query): ISelection {
        const bindings = describeSelectionBindings(statement.params);
        const bind = (): Query => ({
          ...statement,
          params: statement.params.map(value =>
            value instanceof Uint8Array ? new Uint8Array(value) : value,
          ),
        });
        return {
          model,
          models: db.models,
          definition,
          query: { sql: statement.sql, bindings },
          bind,
          all(connection) {
            const rows = connection._.session
              .prepareQuery(bind(), 'arrays', false, 'all')
              .all();
            const mapped = read.mapRows(
              Schema.decodeUnknownSync(
                Schema.Array(Schema.Array(Schema.Unknown)),
              )(rows).map(row => [...row]),
            );
            return Schema.decodeUnknownSync(
              Schema.Array(Schema.toType(model.table.codec)),
            )(mapped).map(row =>
              Effect.runSync(encodeRowAsResource(model, row)),
            );
          },
        };
      },
    };
  }

  capture(props: {
    db: IAnyQueryDbVersion;
    model: IModel;
    key: string;
    identity?: IClaimsSchema;
  }) {
    const { db, model, key, identity } = props;
    const session = this.selectionSession(db, key);
    const snapshot = snapshotSelectionCallbacks({
      config: this.config,
      schema: this.schema,
      table: this.tableConfig,
    });
    const captureQuery = new QuerySelection(
      this.queryResultKind,
      this.schema,
      this.rootTable,
      this.tableConfig,
      this.dialect,
      this.session,
      snapshot.config as typeof this.config,
      this.queryMode,
      this.forbidJsonb,
    );
    const { query, builtQuery } = captureQuery._toSQL();
    const selectionDefinition = captureSelectionDefinition({
      config: snapshot.config,
      table: this.tableConfig,
      relations: this.schema,
      schema: db.config.schema,
      identityEncoders: session.identityEncoders,
      tableAliases: snapshot.aliases,
      identityFields:
        identity === undefined ? [] : Object.keys(identity.fields),
    });
    const bindings = describeSelectionBindings(builtQuery.params, identity);
    const compiled: Query = {
      ...builtQuery,
      params: builtQuery.params.map(value => {
        if (is(value, Placeholder)) {
          return new Placeholder(value['name']);
        }
        if (is(value, Param) && is(value.value, Placeholder)) {
          const trusted = trustedIdentityEncoder({
            encoder: value.encoder,
            encoders: session.identityEncoders,
          });
          const originalEncoder = value.encoder;
          const encoder = new Proxy(
            { mapToDriverValue: trusted },
            {
              get(_target, key) {
                if (key === 'mapToDriverValue') {
                  return (input: unknown) =>
                    trusted.call(originalEncoder, input);
                }
                return Reflect.get(originalEncoder, key, originalEncoder);
              },
              getPrototypeOf() {
                return Object.getPrototypeOf(originalEncoder);
              },
            },
          );
          return new Param(
            new Placeholder(value.value['name']),
            encoder,
            value.codec,
          );
        }
        return value instanceof Uint8Array ? new Uint8Array(value) : value;
      }),
    };
    const mapper = this.dialect.mapperGenerators.relationalRows({
      isFirst: false,
      parseJson: true,
      parseJsonIfString: false,
      rootJsonMappers: false,
      selection: query.selection,
      arrayModeRoot: true,
    });
    const definition: ISelectionQuery = { sql: compiled.sql, bindings };
    const bind = (identity: Readonly<Record<string, unknown>>): Query => {
      for (const binding of bindings) {
        if (
          binding.type === 'identity' &&
          typeof identity[binding.name] !== 'string'
        ) {
          throw new Error(`Missing selection parameter ${binding.name}`);
        }
      }
      return {
        ...compiled,
        params: fillPlaceholders(compiled.params, { ...identity }),
      };
    };
    return {
      model,
      models: db.models,
      definition: selectionDefinition,
      query: definition,
      bind,
      all(db: Pick<IDb, '_'>, identity: Readonly<Record<string, string>>) {
        const rows = db._.session
          .prepareQuery(bind(identity), 'arrays', false, 'all', mapper)
          .all();
        return Schema.decodeUnknownSync(Schema.Array(Schema.Unknown))(rows).map(
          row =>
            Effect.runSync(
              encodeRowAsResource(
                model,
                Schema.decodeUnknownSync(Schema.toType(model.table.codec))(row),
              ),
            ),
        );
      },
    };
  }
}

export type IAnyQueryDbVersion = Readonly<{
  models: IAnyModels;
  config: IDbConfig;
  query: Readonly<Record<string, unknown>>;
}>;

export type IQueryDbVersion<M extends IAnyModels = IAnyModels> = Readonly<{
  models: M;
  config: IResourceDbConfig<M, Record<never, never>>;
  query: {
    [K in keyof IResourceDbConfig<
      M,
      Record<never, never>
    >['relations']]: RelationalQueryBuilder<
      'sync',
      IResourceDbConfig<M, Record<never, never>>['relations'],
      IResourceDbConfig<M, Record<never, never>>['relations'][K],
      IQuerySelectionHKT
    >;
  };
}>;

export const QueryDbSchema = Schema.declare(
  (value: unknown): value is IAnyQueryDbVersion =>
    typeof value === 'object' && value !== null && actorDbs.has(value),
);
const actorDbs = new WeakSet<object>();

export function makeQueryDbVersion<const M extends IAnyModels>(props: {
  models: M;
}) {
  const { models: declaredModels } = props;
  const models = { ...declaredModels };
  for (const name of Object.keys(models)) {
    if (['models', 'config', 'query'].includes(name)) {
      throw new Error(`Query database model name ${name} is reserved`);
    }
  }
  const config = makeResourceDbConfig({ models });
  const dialect = new SQLiteDialect({ codecs: durableSQLiteCodecs });
  const session = new AuthoringSession(dialect, models, config);
  const query = mapValues(
    config.relations,
    relation =>
      new RelationalQueryBuilder(
        'sync',
        config.relations,
        relation.table,
        relation,
        dialect,
        session,
        true,
        QuerySelection,
      ),
  );
  const db = {
    models,
    config,
    query,
  };
  actorDbs.add(db);
  return Schema.decodeUnknownSync(
    Schema.declare<IQueryDbVersion<M>>(
      (value): value is IQueryDbVersion<M> =>
        typeof value === 'object' && value !== null && actorDbs.has(value),
    ),
  )(db);
}

export type IQuerySelections = Readonly<Record<string, QuerySelection>>;
export type ICapturedSelections<
  MODELS extends IAnyModels,
  SELECTIONS extends IQuerySelections,
  IDENTITY = Readonly<Record<string, string>>,
> = {
  readonly [K in keyof SELECTIONS]: ISelection<
    K extends keyof MODELS ? MODELS[K] : IModel,
    IDENTITY
  >;
};
export type ISelection<
  MODEL extends IModel = IModel,
  IDENTITY = Readonly<Record<string, string>>,
> = {
  readonly model: MODEL;
  readonly models: IAnyModels;
  readonly definition: typeof SelectionDefinitionSchema.Type;
  readonly query: ISelectionQuery;
  bind(identity: Readonly<Record<string, unknown>>): Query;
  all(db: Pick<IDb, '_'>, identity: IDENTITY): IInferEncodedResource<MODEL>[];
};
export type IValidQuerySelections<
  MODELS extends IAnyModels,
  SELECTIONS extends IQuerySelections,
> = {
  [K in keyof SELECTIONS]: K extends keyof MODELS
    ? SELECTIONS[K]['_']['result'] extends {
        [C in keyof MODELS[K]['table']['shape']]: unknown;
      }[]
      ? Exclude<
          keyof SELECTIONS[K]['_']['result'][number],
          keyof MODELS[K]['table']['shape']
        > extends never
        ? unknown
        : never
      : never
    : never;
};

/** Capture literal query parameters; identity placeholders are legal only for application actor selections. */
export function captureSelections<
  DB extends IAnyQueryDbVersion,
  SELECTIONS extends IQuerySelections,
  S extends IClaimsSchema | undefined = undefined,
>(
  db: DB,
  selections: SELECTIONS,
  identity?: S,
  inherited?: {
    selections: IQuerySelections;
    capturedSelections: Readonly<Record<string, ISelection>>;
  },
) {
  const declaredSelections: IQuerySelections = selections;
  const captured = mapValues(declaredSelections, (query, key) => {
    const model = db.models[key];
    if (model === undefined || !(query instanceof QuerySelection)) {
      throw new Error(`Invalid query selection ${key}`);
    }
    // Inheritance denotes the already captured declaration, not live options.
    const previous = inherited?.capturedSelections[key];
    if (previous !== undefined && inherited?.selections[key] === query) {
      assertSelectionQueryModels({ selection: previous, models: db.models });
      return previous;
    }
    return query.capture({
      db,
      model,
      key,
      ...(identity === undefined ? {} : { identity }),
    });
  });
  return Schema.decodeUnknownSync(
    Schema.declare<
      ICapturedSelections<
        DB['models'],
        SELECTIONS,
        S extends IClaimsSchema ? S['Type'] : Readonly<Record<never, never>>
      >
    >(
      (
        value,
      ): value is ICapturedSelections<
        DB['models'],
        SELECTIONS,
        S extends IClaimsSchema ? S['Type'] : Readonly<Record<never, never>>
      > => value === captured,
    ),
  )(captured);
}
