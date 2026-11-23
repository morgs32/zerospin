import { getColumns, sql } from 'drizzle-orm';
import { durableSQLiteCodecs } from 'drizzle-orm/durable-sqlite/codecs';
import type {
  BuildRelationalQueryResult,
  DBQueryConfig,
  TableRelationalConfig,
  TablesRelationalConfig,
} from 'drizzle-orm/relations';
import { SQLiteDialect } from 'drizzle-orm/sqlite-core/dialect';
import { npmVersion } from 'drizzle-orm/version';
import * as Schema from 'effect/Schema';
import { isEqual, mapValues } from 'es-toolkit';

import {
  makeDbConfig,
  makeResourceDbConfig,
} from '../../drizzle/make/makeDbConfig/makeDbConfig.ts';
import type { IAnyModels } from '../types.ts';

import type { IReadQuery } from './ReadQuerySchema.ts';

function readRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new Error('Read options must contain plain declarative objects');
  }
  if (Schema.is(Schema.Record(Schema.String, Schema.Unknown))(value)) {
    return value;
  }
  throw new Error('Read options must contain declarative records');
}

/** Copy literal values while refusing SQL wrappers, placeholders, callbacks, and cycles. */
function normalizeLiteral(value: unknown, ancestors: Set<object>): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value);
  }
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (typeof value !== 'object' || value === null || ancestors.has(value)) {
    throw new Error('Read filters must contain serializable literal values');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(item => normalizeLiteral(item, ancestors));
    }
    const record = readRecord(value);
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map(key => [key, normalizeLiteral(record[key], ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

function normalizeFieldFilter(value: unknown, ancestors: Set<object>): unknown {
  if (typeof value !== 'object' || value === null) {
    return normalizeLiteral(value, ancestors);
  }
  const filter = readRecord(value);
  if (ancestors.has(filter)) throw new Error('Read filters must not be cyclic');
  ancestors.add(filter);
  try {
    const normalized: Record<string, unknown> = {};
    mapValues(filter, (operand, operator) => {
      if (
        ![
          'NOT',
          'AND',
          'OR',
          'isNull',
          'isNotNull',
          'in',
          'notIn',
          'arrayContains',
          'arrayContained',
          'arrayOverlaps',
          'like',
          'ilike',
          'notLike',
          'notIlike',
          'eq',
          'ne',
          'gt',
          'gte',
          'lt',
          'lte',
        ].includes(operator)
      ) {
        throw new Error(`Unsupported read field filter ${operator}`);
      }
      if (operand === undefined) return;
      if (operator === 'NOT') {
        normalized[operator] = normalizeFieldFilter(operand, ancestors);
      } else if (operator === 'AND' || operator === 'OR') {
        if (!Array.isArray(operand)) {
          throw new Error(`Read filter ${operator} must be an array`);
        }
        normalized[operator] = operand.map(item =>
          normalizeFieldFilter(item, ancestors),
        );
      } else if (operator === 'isNull' || operator === 'isNotNull') {
        if (operand !== true) {
          throw new Error(`Read filter ${operator} must be true`);
        }
        normalized[operator] = true;
      } else if (
        [
          'in',
          'notIn',
          'arrayContains',
          'arrayContained',
          'arrayOverlaps',
        ].includes(operator)
      ) {
        if (!Array.isArray(operand)) {
          throw new Error(`Read filter ${operator} must be an array`);
        }
        normalized[operator] = normalizeLiteral(operand, ancestors);
      } else if (['like', 'ilike', 'notLike', 'notIlike'].includes(operator)) {
        if (typeof operand !== 'string') {
          throw new Error(`Read filter ${operator} must be a string`);
        }
        normalized[operator] = operand;
      } else if (['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].includes(operator)) {
        normalized[operator] = normalizeLiteral(operand, ancestors);
      } else {
        throw new Error(`Unsupported read field filter ${operator}`);
      }
    });
    return Object.fromEntries(
      Object.keys(normalized)
        .sort()
        .map(key => [key, normalized[key]]),
    );
  } finally {
    ancestors.delete(filter);
  }
}

function normalizeWhere(props: {
  schema: TablesRelationalConfig;
  table: TableRelationalConfig;
  where: unknown;
  ancestors: Set<object>;
}): Record<string, unknown> {
  const { schema, table, where, ancestors } = props;
  const fields = getColumns(table.table);
  const filter = readRecord(where);
  if (ancestors.has(filter)) throw new Error('Read filters must not be cyclic');
  ancestors.add(filter);
  try {
    const normalized: Record<string, unknown> = {};
    mapValues(filter, (value, key) => {
      if (
        key === 'RAW' ||
        (!['NOT', 'AND', 'OR'].includes(key) &&
          !Object.hasOwn(fields, key) &&
          !Object.hasOwn(table.relations, key))
      ) {
        throw new Error(`Unknown read filter ${table.name}.${key}`);
      }
      if (value === undefined) return;
      if (key === 'NOT') {
        normalized[key] = normalizeWhere({
          schema,
          table,
          where: value,
          ancestors,
        });
      } else if (key === 'AND' || key === 'OR') {
        if (!Array.isArray(value)) {
          throw new Error(`Read filter ${key} must be an array`);
        }
        normalized[key] = value.map(item =>
          normalizeWhere({ schema, table, where: item, ancestors }),
        );
      } else if (Object.hasOwn(fields, key)) {
        normalized[key] = normalizeFieldFilter(value, ancestors);
      } else if (Object.hasOwn(table.relations, key)) {
        const relation = table.relations[key]!;
        const relatedTable = schema[relation.targetTableName];
        if (relatedTable === undefined) {
          throw new Error(`Read relation ${table.name}.${key} has no model`);
        }
        normalized[key] =
          typeof value === 'boolean'
            ? value
            : normalizeWhere({
                schema,
                table: relatedTable,
                where: value,
                ancestors,
              });
      } else {
        throw new Error(`Unknown read filter ${table.name}.${key}`);
      }
    });
    return Object.fromEntries(
      Object.keys(normalized)
        .sort()
        .map(key => [key, normalized[key]]),
    );
  } finally {
    ancestors.delete(filter);
  }
}

function normalizeConfig(props: {
  schema: TablesRelationalConfig;
  table: TableRelationalConfig;
  config: unknown;
  ancestors: Set<object>;
}): Record<string, unknown> {
  const { schema, table, config, ancestors } = props;
  if (config === true) return {};
  const record = readRecord(config);
  if (ancestors.has(record)) throw new Error('Read options must not be cyclic');
  ancestors.add(record);
  try {
    const fields = getColumns(table.table);
    const normalized: Record<string, unknown> = {};
    mapValues(record, (value, key) => {
      if (
        !['columns', 'with', 'where', 'orderBy', 'limit', 'offset'].includes(
          key,
        )
      ) {
        throw new Error(`Unsupported read option ${key}`);
      }
      if (value === undefined) return;
      if (key === 'columns') {
        const columns: Record<string, boolean> = {};
        mapValues(readRecord(value), (included, field) => {
          if (!Object.hasOwn(fields, field)) {
            throw new Error(`Invalid read column ${table.name}.${field}`);
          }
          if (included === undefined) return;
          if (typeof included !== 'boolean') {
            throw new Error(`Invalid read column ${table.name}.${field}`);
          }
          columns[field] = included;
        });
        normalized[key] = Object.fromEntries(
          Object.keys(columns)
            .sort()
            .map(field => [field, columns[field]]),
        );
      } else if (key === 'with') {
        const relations: Record<string, unknown> = {};
        mapValues(readRecord(value), (selection, relationName) => {
          if (!Object.hasOwn(table.relations, relationName)) {
            throw new Error(
              `Unknown read relation ${table.name}.${relationName}`,
            );
          }
          if (selection === undefined) return;
          const relation = table.relations[relationName]!;
          const relatedTable = schema[relation.targetTableName];
          if (relatedTable === undefined) {
            throw new Error(
              `Read relation ${table.name}.${relationName} has no model`,
            );
          }
          relations[relationName] =
            typeof selection === 'boolean'
              ? selection
              : normalizeConfig({
                  schema,
                  table: relatedTable,
                  config: selection,
                  ancestors,
                });
        });
        normalized[key] = Object.fromEntries(
          Object.keys(relations)
            .sort()
            .map(relation => [relation, relations[relation]]),
        );
      } else if (key === 'where') {
        normalized[key] = normalizeWhere({
          schema,
          table,
          where: value,
          ancestors,
        });
      } else if (key === 'orderBy') {
        const order: Record<string, 'asc' | 'desc'> = {};
        mapValues(readRecord(value), (direction, field) => {
          if (!Object.hasOwn(fields, field)) {
            throw new Error(`Invalid read order ${table.name}.${field}`);
          }
          if (direction === undefined) return;
          if (direction !== 'asc' && direction !== 'desc') {
            throw new Error(`Invalid read order ${table.name}.${field}`);
          }
          order[field] = direction;
        });
        // Order is semantic: retain the caller's priority for multiple fields.
        normalized[key] = order;
      } else if (key === 'limit' || key === 'offset') {
        if (
          typeof value !== 'number' ||
          !Number.isSafeInteger(value) ||
          value < 0
        ) {
          throw new Error(`Read ${key} must be a nonnegative safe integer`);
        }
        normalized[key] = value;
      } else {
        throw new Error(`Unsupported read option ${key}`);
      }
    });
    return Object.fromEntries(
      Object.keys(normalized)
        .sort()
        .map(key => [key, normalized[key]]),
    );
  } finally {
    ancestors.delete(record);
  }
}

export function normalizeReadConfig(props: {
  models: IAnyModels;
  modelName: string;
  config: unknown;
}): Record<string, unknown> {
  const { models, modelName, config } = props;
  const { relations } = makeResourceDbConfig({ models });
  if (!Object.hasOwn(relations, modelName)) {
    throw new Error(`Unknown read model ${modelName}`);
  }
  return normalizeConfig({
    schema: relations,
    table: relations[modelName]!,
    config,
    ancestors: new Set(),
  });
}

function readLayout(
  selection: BuildRelationalQueryResult['selection'],
): Schema.Json[] {
  return selection.map(field => ({
    key: field.key,
    isArray: field.isArray ?? false,
    isOptional: field.isOptional ?? false,
    arrayDimensions: field.arrayDimensions ?? 0,
    selection: field.selection === undefined ? [] : readLayout(field.selection),
  }));
}

/** Compile only declared resource models; internal projection tables are never exposed. */
export function compileReadQuery(props: {
  models: IAnyModels;
  query: IReadQuery;
  physicalTableNames?: Readonly<Record<string, string>>;
}) {
  const { models, query } = props;
  const read = query;
  const selectedModels: IAnyModels = mapValues(read.models, (identity, key) => {
    const model = models[key];
    if (
      !Object.hasOwn(models, key) ||
      model === undefined ||
      identity.modelName !== model.modelName ||
      identity.version !== model.version ||
      !isEqual(identity.columns, Object.keys(model.table.shape).sort())
    ) {
      throw new Error(`Read model ${key} does not match the owner model`);
    }
    return model;
  });
  const { relations } = makeDbConfig({
    tables: mapValues(selectedModels, model => model.table),
    ...(props.physicalTableNames === undefined
      ? {}
      : { physicalTableNames: props.physicalTableNames }),
  });
  if (!Object.hasOwn(relations, read.modelName)) {
    throw new Error(`Unknown read model ${read.modelName}`);
  }
  const table = relations[read.modelName]!;
  // The model-aware validator checks the complete supported Drizzle grammar.
  const declarativeConfig = Schema.declare<DBQueryConfig<'many'>>(
    (value): value is DBQueryConfig<'many'> => {
      try {
        normalizeConfig({
          schema: relations,
          table,
          config: value,
          ancestors: new Set(),
        });
        return true;
      } catch {
        return false;
      }
    },
  );
  const config = Schema.decodeUnknownSync(declarativeConfig)(
    normalizeConfig({
      schema: relations,
      table,
      config: read.config,
      ancestors: new Set(),
    }),
  );
  const dialect = new SQLiteDialect({ codecs: durableSQLiteCodecs });
  const compiled = dialect.buildRelationalQuery({
    schema: relations,
    table: table.table,
    tableConfig: table,
    queryConfig: config,
    mode: read.mode,
    jsonb: sql`json`,
  });
  return {
    builtQuery: dialect.sqlToQuery(compiled.sql),
    compilerVersion: npmVersion,
    layout: readLayout(compiled.selection),
    selection: compiled.selection,
  };
}
