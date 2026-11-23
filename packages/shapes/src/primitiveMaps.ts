import { getTableColumns, isNotNull, isNull } from 'drizzle-orm';
import type { ColumnBuilderBase } from 'drizzle-orm/column-builder';
import {
  integer as drizzleInteger,
  real as drizzleReal,
  text as drizzleText,
  index,
  sqliteTable,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import {
  compileDescriptor,
  validatePrimitiveDescriptor,
} from './compileDescriptor.ts';
import type { IEncodedShape } from './encodeShape.ts';
import { makeShapeCodecs } from './makeShapeCodecs.ts';
import { PrimitiveKind } from './primitiveKind.ts';
import type {
  IAnyDrizzleSchema,
  IDrizzleIndexConfig,
  IDrizzleSchema,
  IInferDecodedRow,
  IInferDrizzleColumnBuilderFromDescriptor,
  IInferDrizzleColumnBuildersFromShape,
  IInferEncodedRow,
  IInferIdFromAbbreviation,
  IPrimitiveDescriptor,
  IPrimitiveDescriptorDecoded,
  IPrimitiveDescriptorEncoded,
  IReference,
  IShape,
  ITable,
} from './types.ts';

function buildDrizzleColumnsFromShape<SHAPE extends IShape>(
  shape: SHAPE,
  resolveReference?: (
    descriptor: IPrimitiveDescriptor & { references: IReference },
  ) => () => AnySQLiteColumn,
): IInferDrizzleColumnBuildersFromShape<SHAPE> {
  const columns: Partial<IInferDrizzleColumnBuildersFromShape<SHAPE>> = {};
  mapValues(
    shape,
    <KEY extends keyof SHAPE>(descriptor: SHAPE[KEY], key: KEY) => {
      columns[key] = descriptorToDrizzleColumn({
        key: String(key),
        descriptor,
        ...(descriptor.references !== undefined &&
        resolveReference !== undefined
          ? {
              reference: resolveReference(
                descriptor as IPrimitiveDescriptor & { references: IReference },
              ),
            }
          : {}),
      });
    },
  );
  return columns as IInferDrizzleColumnBuildersFromShape<SHAPE>;
}

export function isAttributeDescriptor(
  value: unknown,
): value is IPrimitiveDescriptor {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return false;
  }
  try {
    validatePrimitiveDescriptor(value as IPrimitiveDescriptor);
    return true;
  } catch {
    return false;
  }
}

export function descriptorToEffectSchema(
  descriptor: IPrimitiveDescriptor,
): Schema.Codec<unknown, unknown> {
  return compileDescriptor(descriptor).rowCodec;
}

export function descriptorToJsonEffectSchema(
  descriptor: IPrimitiveDescriptor,
): Schema.Codec<unknown, unknown> {
  return compileDescriptor(descriptor).portableCodec;
}

export function descriptorToDrizzleColumn<
  D extends IPrimitiveDescriptor,
>(props: {
  key: string;
  descriptor: D;
  reference?: () => AnySQLiteColumn;
}): IInferDrizzleColumnBuilderFromDescriptor<D>;
export function descriptorToDrizzleColumn(props: {
  key: string;
  descriptor: IEncodedShape[string];
  reference?: () => AnySQLiteColumn;
}): ColumnBuilderBase;
/** Build the scalar column, then apply its owned constraints and relationship. */
export function descriptorToDrizzleColumn(props: {
  key: string;
  descriptor: IPrimitiveDescriptor | IEncodedShape[string];
  reference?: () => AnySQLiteColumn;
}): ColumnBuilderBase {
  const { reference, key, descriptor } = props;
  const nullable = descriptor.nullable === true;
  const column = (() => {
    switch (descriptor.kind) {
      case PrimitiveKind.Boolean: {
        let col = nullable
          ? drizzleInteger(key, { mode: 'boolean' })
          : drizzleInteger(key, { mode: 'boolean' }).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(descriptor.defaultValue);
        }
        return col;
      }
      case PrimitiveKind.Integer: {
        let col = nullable
          ? drizzleInteger(key)
          : drizzleInteger(key).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(descriptor.defaultValue);
        }
        return col;
      }
      case PrimitiveKind.Number: {
        let col = nullable ? drizzleReal(key) : drizzleReal(key).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(descriptor.defaultValue);
        }
        return col;
      }
      case PrimitiveKind.Text: {
        if (nullable) {
          let col = drizzleText(key).$type<string | null>();
          if (descriptor.defaultValue !== undefined) {
            col = col.default(descriptor.defaultValue);
          }
          return col;
        }
        let col = drizzleText(key).notNull();
        if (
          descriptor.defaultValue !== undefined &&
          descriptor.defaultValue !== null
        ) {
          col = col.default(descriptor.defaultValue);
        }
        return col;
      }
      case PrimitiveKind.Json: {
        if (nullable) {
          let col = drizzleText(key).$type<string | null>();
          if (descriptor.defaultValue === null) col = col.default(null);
          return col;
        }
        return drizzleText(key).$type<string>().notNull();
      }
      case PrimitiveKind.Date: {
        let col = nullable
          ? drizzleInteger(key, { mode: 'timestamp_ms' })
          : drizzleInteger(key, { mode: 'timestamp_ms' }).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(
            typeof descriptor.defaultValue === 'string'
              ? new Date(descriptor.defaultValue)
              : descriptor.defaultValue,
          );
        }
        return col;
      }
      case PrimitiveKind.Enum: {
        let col = nullable
          ? drizzleText(key, { enum: descriptor.values })
          : drizzleText(key, { enum: descriptor.values }).notNull();
        if (descriptor.defaultValue !== undefined) {
          col = col.default(descriptor.defaultValue);
        }
        return col;
      }
      case PrimitiveKind.Id:
      case PrimitiveKind.Cursor:
        return nullable
          ? drizzleText(key).$type<
              IInferIdFromAbbreviation<typeof descriptor.abbreviation>
            >()
          : drizzleText(key)
              .$type<IInferIdFromAbbreviation<typeof descriptor.abbreviation>>()
              .notNull();
      default:
        throw new Error('Unsupported primitive descriptor kind');
    }
  })();
  if (reference !== undefined) column.references(reference);
  if (descriptor.primaryKey === true) return column.primaryKey();
  return descriptor.unique === true ? column.unique() : column;
}

export function makeEffectSchema<SHAPE extends IShape>(
  properties: SHAPE,
): Schema.Codec<IInferDecodedRow<SHAPE>, IInferEncodedRow<SHAPE>> &
  Schema.Struct<{
    [K in keyof SHAPE]: Schema.Codec<
      IPrimitiveDescriptorDecoded<SHAPE[K]>,
      IPrimitiveDescriptorEncoded<SHAPE[K]>
    >;
  }> {
  return makeShapeCodecs(properties).rowCodec;
}

export function makeDrizzleSchema<
  TABLE_NAME extends string,
  COLUMNS extends IShape,
>(
  tableName: TABLE_NAME,
  attributes: COLUMNS,
): IDrizzleSchema<TABLE_NAME, COLUMNS> {
  const columns = buildDrizzleColumnsFromShape(attributes);
  return sqliteTable(tableName, columns);
}

export function makeDrizzleSchemaFromTable<
  TABLE_NAME extends string,
  SHAPE extends IShape,
  DECODED extends boolean = false,
>(
  table: ITable<TABLE_NAME, SHAPE>,
  resolveReference?: (
    descriptor: IPrimitiveDescriptor & { references: IReference },
  ) => () => AnySQLiteColumn,
  decodeJson?: DECODED,
  physical?: { name: string; indexes: readonly IDrizzleIndexConfig<string>[] },
): IDrizzleSchema<TABLE_NAME, SHAPE, DECODED>;
export function makeDrizzleSchemaFromTable(
  table: ITable<string, IShape>,
  resolveReference?: (
    descriptor: IPrimitiveDescriptor & { references: IReference },
  ) => () => AnySQLiteColumn,
  decodeJson = false,
  physical?: { name: string; indexes: readonly IDrizzleIndexConfig<string>[] },
): IAnyDrizzleSchema {
  const { shape } = table;
  const { indexes, name } = physical ?? table;
  const columns = buildDrizzleColumnsFromShape(shape, resolveReference);
  const result = sqliteTable(name, columns, tableColumns =>
    indexes.map(indexConfig => {
      const [firstColumnName, ...otherColumnNames] = indexConfig.columns;
      const indexedTableColumns = tableColumns as Record<
        string,
        (typeof tableColumns)[keyof typeof tableColumns]
      >;
      const firstColumn = indexedTableColumns[firstColumnName]!;
      const otherColumns = otherColumnNames.map(
        columnName => indexedTableColumns[columnName]!,
      );
      const builder =
        indexConfig.unique === true
          ? uniqueIndex(indexConfig.name)
          : index(indexConfig.name);
      const declaredIndex = builder.on(firstColumn, ...otherColumns);
      if (indexConfig.where === undefined) return declaredIndex;
      const predicateColumn = indexedTableColumns[indexConfig.where.column];
      if (predicateColumn === undefined) {
        throw new Error(
          `Missing index predicate column ${indexConfig.where.column}`,
        );
      }
      return declaredIndex.where(
        indexConfig.where.condition === 'isNull'
          ? isNull(predicateColumn)
          : isNotNull(predicateColumn),
      );
    }),
  );
  if (decodeJson) {
    const resultColumns = getTableColumns(result);
    mapValues(shape, (descriptor, key) => {
      if (descriptor.kind !== PrimitiveKind.Json) return;
      const column = resultColumns[key];
      if (column === undefined) throw new Error(`Missing JSON column ${key}`);
      const codec = descriptorToEffectSchema(descriptor);
      column.mapFromDriverValue = Schema.decodeUnknownSync(codec);
      column.mapToDriverValue = Schema.encodeSync(codec);
    });
  }
  return result;
}

export function makeDrizzleSchemaFromEncodedTable(props: {
  name: string;
  shape: IEncodedShape;
  indexes: readonly IDrizzleIndexConfig<string>[];
}): IAnyDrizzleSchema {
  const { indexes, name, shape } = props;
  const columns: Record<string, ColumnBuilderBase> = mapValues(
    shape,
    (descriptor, key) =>
      descriptorToDrizzleColumn({ key: String(key), descriptor }),
  );
  if (indexes.length === 0) {
    return sqliteTable(name, columns);
  }
  return sqliteTable(name, columns, tableColumns =>
    indexes.map(indexConfig => {
      const [firstColumnName, ...otherColumnNames] = indexConfig.columns;
      const indexedTableColumns = tableColumns as Record<
        string,
        (typeof tableColumns)[keyof typeof tableColumns]
      >;
      const firstColumn = indexedTableColumns[firstColumnName]!;
      const otherColumns = otherColumnNames.map(
        columnName => indexedTableColumns[columnName]!,
      );
      const builder =
        indexConfig.unique === true
          ? uniqueIndex(indexConfig.name)
          : index(indexConfig.name);
      const declaredIndex = builder.on(firstColumn, ...otherColumns);
      if (indexConfig.where === undefined) return declaredIndex;
      const predicateColumn = indexedTableColumns[indexConfig.where.column];
      if (predicateColumn === undefined) {
        throw new Error(
          `Missing index predicate column ${indexConfig.where.column}`,
        );
      }
      return declaredIndex.where(
        indexConfig.where.condition === 'isNull'
          ? isNull(predicateColumn)
          : isNotNull(predicateColumn),
      );
    }),
  );
}
