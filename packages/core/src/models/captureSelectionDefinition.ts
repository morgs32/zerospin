import {
  Column,
  getColumns,
  getColumnTable,
  getOriginalColumnFromAlias,
  getTableName,
  is,
  Name,
  noopEncoder,
  Param,
  Placeholder,
  SQL,
  StringChunk,
  Table,
} from 'drizzle-orm';
import {
  EmptyFilter,
  operators,
  orderByOperators,
  type TableRelationalConfig,
  type TablesRelationalConfig,
} from 'drizzle-orm/relations';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

const defaultIdentityEncoder = noopEncoder.mapToDriverValue;

export function trustedIdentityEncoder(props: {
  encoder: unknown;
  encoders: ReadonlyMap<Column, Column['mapToDriverValue']>;
}): Column['mapToDriverValue'] {
  const { encoder, encoders } = props;
  if (encoder === noopEncoder) {
    if (noopEncoder.mapToDriverValue !== defaultIdentityEncoder) {
      throw new Error(
        'Identity placeholders require a canonical column or default encoder',
      );
    }
    return defaultIdentityEncoder;
  }
  if (!is(encoder, Column)) {
    throw new Error(
      'Identity placeholders require a canonical column or default encoder',
    );
  }
  const table = getColumnTable(encoder);
  const actualColumn = Object.values(getColumns(table)).some(
    column => column === encoder,
  );
  const original = getOriginalColumnFromAlias(encoder);
  const trusted = encoders.get(original);
  if (
    !actualColumn ||
    trusted === undefined ||
    encoder.mapToDriverValue !== trusted
  ) {
    throw new Error(
      'Identity placeholders require a canonical column or default encoder',
    );
  }
  return trusted;
}

/** Capture authored options and SQL fragments, never a dialect's compiled query. */
export function captureSelectionDefinition(props: {
  config: unknown;
  table: TableRelationalConfig;
  relations: TablesRelationalConfig;
  schema: Readonly<Record<string, Table>>;
  identityFields: readonly string[];
  identityEncoders: ReadonlyMap<Column, Column['mapToDriverValue']>;
  tableAliases?: ReadonlyMap<Table, { table: Table; scope: readonly string[] }>;
}) {
  const {
    config,
    table,
    relations,
    schema,
    identityFields,
    identityEncoders,
    tableAliases,
  } = props;
  const ancestors = new Set<object>();
  let usesSql = false;

  function capture(
    value: unknown,
    context: TableRelationalConfig,
  ): Schema.Json {
    if (value === EmptyFilter) return ['empty'];
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') {
      return ['bigint', String(value)];
    }
    if (typeof value !== 'object' || value === null || ancestors.has(value)) {
      throw new Error(
        'Selection definitions require serializable, acyclic options',
      );
    }
    if (is(value, Placeholder)) {
      if (!identityFields.includes(value['name'])) {
        throw new Error(`Undeclared selection identity field ${value['name']}`);
      }
      return ['identity', value['name']];
    }
    if (is(value, Column) || is(value, Table)) {
      usesSql = true;
      const original = is(value, Column) ? getColumnTable(value) : value;
      const alias = tableAliases?.get(original);
      const source = alias?.table ?? original;
      const modelName = getTableName(source);
      if (
        relations[modelName]?.table !== source &&
        schema[modelName] !== source
      ) {
        throw new Error(
          `Selection expression must reference a canonical model: ${modelName}`,
        );
      }
      return is(value, Column)
        ? alias === undefined
          ? ['column', modelName, value.name]
          : ['scoped-column', [...alias.scope], modelName, value.name]
        : alias === undefined
          ? ['table', modelName]
          : ['scoped-table', [...alias.scope], modelName];
    }
    ancestors.add(value);
    try {
      if (value instanceof Date && Number.isFinite(value.getTime())) {
        return ['date', value.toISOString()];
      }
      if (value instanceof Uint8Array) {
        return ['bytes', [...value]];
      }
      if (is(value, Param)) {
        usesSql = true;
        if (is(value.value, Placeholder)) {
          trustedIdentityEncoder({
            encoder: value.encoder,
            encoders: identityEncoders,
          });
          return value.encoder === noopEncoder
            ? ['parameter', capture(value.value, context)]
            : [
                'parameter',
                capture(value.value, context),
                capture(value.encoder, context),
              ];
        }
        return [
          'parameter',
          capture(
            value.value === null || is(value.value, SQL)
              ? value.value
              : value.encoder.mapToDriverValue(value.value),
            context,
          ),
        ];
      }
      if (is(value, StringChunk)) return ['text', value.value];
      if (is(value, Name)) return ['identifier', value.value];
      if (is(value, SQL)) {
        usesSql = true;
        return [
          'sql',
          value.queryChunks
            .filter(chunk => chunk !== undefined)
            .map(chunk => capture(chunk, context)),
        ];
      }
      if (is(value, SQL.Aliased)) {
        usesSql = true;
        return ['alias', value.fieldAlias, capture(value.sql, context)];
      }
      if (Array.isArray(value)) {
        return ['array', value.map(item => capture(item, context))];
      }
      if (
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      ) {
        throw new Error(
          'Unsupported selection expression; use declarative options or authored SQL',
        );
      }
      const record = Schema.decodeUnknownSync(
        Schema.Record(Schema.String, Schema.Unknown),
      )(value);
      const fields: Record<string, Schema.Json> = {};
      mapValues(record, (item, key) => {
        if (item === undefined) return;
        const related = context.relations[key];
        const child =
          related === undefined ? context : relations[related.targetTableName];
        if (child === undefined) {
          throw new Error(`Unknown selection relation ${key}`);
        }
        if (typeof item === 'function') {
          if (key !== 'RAW' && key !== 'orderBy') {
            throw new Error(`Unsupported selection callback ${key}`);
          }
          usesSql = true;
          fields[key] = capture(
            item(context.table, { ...operators, ...orderByOperators }),
            child,
          );
        } else {
          fields[key] = capture(item, child);
        }
      });
      return [
        'record',
        Object.fromEntries(
          Object.keys(fields)
            .sort()
            .map(key => [key, fields[key]!]),
        ),
      ];
    } finally {
      ancestors.delete(value);
    }
  }

  const captured = capture(config === true ? {} : config, table);
  return { config: usesSql ? ['sql-selection-v2', captured] : captured };
}
