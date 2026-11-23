import { makeZerospinError } from '@zerospin/error';
import { isAttributeDescriptor } from '@zerospin/shapes';
import type { AnyRelation } from 'drizzle-orm';
import type {
  BuildQueryResult,
  DBQueryConfig,
  EmptyFilter,
} from 'drizzle-orm/relations';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type { IDb, IDrizzleRelationsFromModels } from '../../drizzle/types.ts';
import type { IAnyModels } from '../../models/types.ts';
import type { IReadModel, IReadModels } from '../readProjection.ts';

type IContractReadRelations<
  M extends IReadModels,
  R extends IDrizzleRelationsFromModels<M> = IDrizzleRelationsFromModels<M>,
> = {
  [K in keyof R]: Omit<R[K], 'relations'> & {
    relations: {
      [N in keyof R[K]['relations'] as R[K]['relations'][N] extends {
        targetTableName: infer T;
      }
        ? [T] extends [never]
          ? never
          : T extends keyof M
            ? N
            : never
        : never]: Extract<R[K]['relations'][N], AnyRelation>;
    };
  };
};
type IScopedRelation<
  M extends IReadModels,
  K extends keyof M & string,
  N extends keyof IContractReadRelations<M>[K]['relations'],
> = IContractReadRelations<M>[K]['relations'][N] extends {
  targetTableName: infer T;
}
  ? T & keyof M & string
  : never;
type IObjectWhere<M extends IReadModels, K extends keyof M & string> = Omit<
  Exclude<
    NonNullable<
      DBQueryConfig<
        'many',
        IContractReadRelations<M>,
        IContractReadRelations<M>[K]
      >['where']
    >,
    EmptyFilter
  >,
  'RAW' | 'AND' | 'OR' | 'NOT' | keyof IContractReadRelations<M>[K]['relations']
> & {
  RAW?: never;
  AND?: IObjectWhere<M, K>[];
  OR?: IObjectWhere<M, K>[];
  NOT?: IObjectWhere<M, K>;
} & {
  [N in keyof IContractReadRelations<M>[K]['relations']]?:
    | boolean
    | IObjectWhere<M, IScopedRelation<M, K, N>>;
};
export type IContractReadOptions<
  M extends IReadModels,
  K extends keyof M & string,
> = Partial<
  Omit<
    DBQueryConfig<
      'many',
      IContractReadRelations<M>,
      IContractReadRelations<M>[K]
    >,
    'where' | 'with' | 'extras' | 'orderBy'
  >
> & {
  extras?: never;
  where?: IObjectWhere<M, K>;
  orderBy?: Exclude<
    DBQueryConfig<
      'many',
      IContractReadRelations<M>,
      IContractReadRelations<M>[K]
    >['orderBy'],
    (...args: never[]) => unknown
  >;
  with?: keyof IContractReadRelations<M>[K]['relations'] extends never
    ? never
    : {
        [N in keyof IContractReadRelations<M>[K]['relations']]?:
          | boolean
          | IContractReadOptions<M, IScopedRelation<M, K, N>>;
      };
};
type IExactWhere<M extends IReadModels, K extends keyof M & string, Q> = {
  [N in keyof Q]: N extends keyof IObjectWhere<M, K>
    ? N extends 'AND' | 'OR'
      ? Q[N] extends readonly (infer B)[]
        ? IExactWhere<M, K, B>[]
        : Q[N]
      : N extends 'NOT'
        ? IExactWhere<M, K, Q[N]>
        : N extends keyof IContractReadRelations<M>[K]['relations']
          ? Q[N] extends boolean
            ? Q[N]
            : IExactWhere<M, IScopedRelation<M, K, N>, Q[N]>
          : Q[N]
    : never;
};
export type IExactContractReadOptions<
  M extends IReadModels,
  K extends keyof M & string,
  Q,
> = {
  [N in keyof Q]: N extends 'db' | 'model'
    ? Q[N]
    : N extends keyof IContractReadOptions<M, K>
      ? N extends 'where'
        ? IExactWhere<M, K, Q[N]>
        : N extends 'with'
          ? {
              [R in keyof Q[N]]: R extends keyof IContractReadRelations<M>[K]['relations']
                ? Q[N][R] extends boolean
                  ? Q[N][R]
                  : IExactContractReadOptions<
                      M,
                      IScopedRelation<M, K, R>,
                      Q[N][R]
                    >
                : never;
            }
          : N extends 'columns' | 'orderBy'
            ? {
                [F in keyof Q[N]]: F extends keyof M[K]['table']['shape']
                  ? Q[N][F]
                  : never;
              }
            : Q[N]
      : never;
};
export type IContractReadResult<
  M extends IReadModels,
  K extends keyof M & string,
  Q extends Record<string, unknown>,
> = BuildQueryResult<
  IContractReadRelations<M>,
  IContractReadRelations<M>[K],
  Q
>;

/** Authored code receives model reads only; physical SQLite handles stay in execution. */
export interface IContractReadDb<M extends IReadModels = IReadModels> {
  readonly models: {
    readonly [K in keyof M]: Readonly<Pick<M[K], 'modelName' | 'table'>>;
  };
  read(
    model: IReadModel,
    options: Record<string, unknown>,
    first: boolean,
  ): Effect.Effect<unknown>;
}

type IReadSource = {
  readonly models?: IReadModels;
  read(
    model: IReadModel,
    options: Record<string, unknown>,
    first: boolean,
  ): Effect.Effect<unknown>;
};

export function scopeContractReadDb<M extends IReadModels>(
  source: IReadSource,
  models: M,
): IContractReadDb<M> {
  const relations: Record<string, Record<string, string>> = Object.fromEntries(
    Object.keys(models).map(name => [name, {}]),
  );
  mapValues(models, (model, name) => {
    const modelName = String(name);
    for (const descriptor of Object.values(model.table.shape)) {
      if (
        !isAttributeDescriptor(descriptor) ||
        descriptor.references === undefined ||
        !Object.hasOwn(models, descriptor.references.tableName)
      ) {
        continue;
      }
      relations[modelName]![descriptor.references.relation] =
        descriptor.references.tableName;
      relations[descriptor.references.tableName]![
        descriptor.references.inverse
      ] = modelName;
    }
  });
  const check = (name: string, options: Record<string, unknown>) => {
    const config = models[name];
    if (config === undefined) {
      throw makeZerospinError('contract-read-model-out-of-scope');
    }
    for (const key of Object.keys(options)) {
      if (
        !['columns', 'where', 'with', 'orderBy', 'limit', 'offset'].includes(
          key,
        )
      ) {
        throw makeZerospinError('contract-read-filter-invalid');
      }
    }
    if (options.orderBy !== undefined) {
      if (typeof options.orderBy !== 'object' || options.orderBy === null) {
        throw makeZerospinError('contract-read-filter-invalid');
      }
      mapValues(options.orderBy, (order, column) => {
        if (
          !Object.hasOwn(config.table.shape, column) ||
          !['asc', 'desc', undefined].includes(order)
        ) {
          throw makeZerospinError('contract-read-filter-invalid');
        }
      });
    }
    if (options.columns !== undefined) {
      if (typeof options.columns !== 'object' || options.columns === null) {
        throw makeZerospinError('contract-read-filter-invalid');
      }
      mapValues(options.columns, (included, column) => {
        if (
          !Object.hasOwn(config.table.shape, column) ||
          ![true, false, undefined].includes(included)
        ) {
          throw makeZerospinError('contract-read-filter-invalid');
        }
      });
    }
    for (const field of ['with', 'where'] as const) {
      const nested = options[field];
      if (nested === undefined) continue;
      if (typeof nested !== 'object' || nested === null) {
        throw makeZerospinError('contract-read-filter-invalid');
      }
      mapValues(nested, (value, key) => {
        if (field === 'where' && ['AND', 'OR', 'NOT'].includes(key)) {
          for (const branch of Array.isArray(value) ? value : [value]) {
            check(name, { where: branch });
          }
          return;
        }
        if (field === 'where' && Object.hasOwn(config.table.shape, key)) {
          return;
        }
        const relation = relations[name]?.[key];
        if (relation === undefined) {
          throw makeZerospinError('contract-read-relation-out-of-scope');
        }
        if (value !== false && value !== undefined && value !== null) {
          check(
            relation,
            field === 'where'
              ? { where: value === true ? {} : value }
              : value === true
                ? {}
                : value,
          );
        }
      });
    }
  };
  const columnsFor = (name: string, options: Record<string, unknown>) => {
    const model = models[name];
    if (model === undefined)
      throw makeZerospinError('contract-read-model-out-of-scope');
    const available = Object.keys(model.table.shape);
    const columns = options.columns;
    if (typeof columns !== 'object' || columns === null) return available;
    let included = false;
    mapValues(columns, value => {
      if (value === true) included = true;
    });
    return available.filter(field =>
      included
        ? Reflect.get(columns, field) === true
        : Reflect.get(columns, field) !== false,
    );
  };
  const limitOptions = (
    name: string,
    options: Record<string, unknown>,
  ): Record<string, unknown> => {
    const selected = columnsFor(name, options);
    // Drizzle needs a physical column when the caller selected none. The
    // extra ID is removed from the result before authored code receives it.
    const queryColumns = selected.length === 0 ? ['id'] : selected;
    const nested = options.with;
    const withRelations =
      typeof nested !== 'object' || nested === null
        ? nested
        : mapValues(nested, (value, relation) => {
            if (value === false || value === undefined || value === null)
              return value;
            const destination = relations[name]?.[relation];
            if (destination === undefined)
              throw makeZerospinError('contract-read-relation-out-of-scope');
            return limitOptions(
              destination,
              value === true
                ? {}
                : Schema.decodeUnknownSync(
                    Schema.Record(Schema.String, Schema.Unknown),
                  )(value),
            );
          });
    return {
      ...options,
      columns: Object.fromEntries(queryColumns.map(field => [field, true])),
      ...(nested === undefined ? {} : { with: withRelations }),
    };
  };
  const limitResult = (
    name: string,
    options: Record<string, unknown>,
    result: unknown,
  ): unknown => {
    if (Array.isArray(result))
      return result.map(row => limitResult(name, options, row));
    if (result === undefined || result === null || typeof result !== 'object')
      return result;
    const row = Schema.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.Unknown),
    )(result);
    const allowed = new Set(columnsFor(name, options));
    const nested = options.with;
    const entries: Array<[string, unknown]> = [];
    mapValues(row, (value, field) => {
      if (allowed.has(field)) {
        entries.push([field, value]);
        return;
      }
      if (
        typeof nested !== 'object' ||
        nested === null ||
        !Object.hasOwn(nested, field)
      )
        return;
      const relationOptions = Reflect.get(nested, field);
      const destination = relations[name]?.[field];
      if (
        destination === undefined ||
        relationOptions === false ||
        relationOptions == null
      )
        return;
      const child =
        relationOptions === true
          ? {}
          : Schema.decodeUnknownSync(
              Schema.Record(Schema.String, Schema.Unknown),
            )(relationOptions);
      entries.push([field, limitResult(destination, child, value)]);
    });
    return Object.fromEntries(entries);
  };
  return Object.freeze({
    models,
    read: (
      model: IReadModel,
      options: Record<string, unknown>,
      first: boolean,
    ) =>
      Effect.suspend(() => {
        if (models[model.modelName] !== model) {
          throw makeZerospinError('contract-read-model-out-of-scope');
        }
        check(model.modelName, options);
        const sourceModel =
          source.models === undefined ? model : source.models[model.modelName];
        if (sourceModel === undefined) {
          throw makeZerospinError('contract-read-model-out-of-scope');
        }
        return source
          .read(sourceModel, limitOptions(model.modelName, options), first)
          .pipe(
            Effect.map(result => limitResult(model.modelName, options, result)),
          );
      }),
  });
}

/** Both adapters read the same decoded relational schemas and compose in Effect. */
export function makeContractReadDb<M extends IAnyModels>(props: {
  db: Readonly<Pick<IDb, 'query'>>;
  models: M;
}): IContractReadDb<M> {
  const { db, models } = props;

  return scopeContractReadDb(
    {
      read: (model, options, first) =>
        Effect.sync(() => {
          const query = db.query[model.modelName];
          if (query === undefined) {
            throw new Error(`Missing model query ${model.modelName}`);
          }
          return first
            ? query
                .findFirst(options as Parameters<typeof query.findFirst>[0])
                .sync()
            : query
                .findMany(options as Parameters<typeof query.findMany>[0])
                .sync();
        }),
    },
    models,
  );
}

export function makeAsyncContractReadDb<M extends IAnyModels>(props: {
  query: SqliteRemoteDatabase<
    unknown,
    IDrizzleRelationsFromModels<IAnyModels>
  >['query'];
  models: M;
}): IContractReadDb<M> {
  const { query: queries, models } = props;
  return scopeContractReadDb(
    {
      read: (model, options, first) =>
        Effect.promise(() => {
          const query = queries[model.modelName];
          if (query === undefined) {
            throw new Error(`Missing model query ${model.modelName}`);
          }
          return Promise.resolve(
            first
              ? query.findFirst(
                  options as Parameters<typeof query.findFirst>[0],
                )
              : query.findMany(options as Parameters<typeof query.findMany>[0]),
          );
        }),
    },
    models,
  );
}
