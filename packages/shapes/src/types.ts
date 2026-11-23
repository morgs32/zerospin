import type {
  $Type,
  BuildColumns,
  ColumnBuilderBase,
  HasDefault,
  IsPrimaryKey,
  NotNull,
} from 'drizzle-orm/column-builder';
import type {
  AnySQLiteTable,
  SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import type { Effect, Schema } from 'effect';

import type { Table } from './makeTable.ts';
import type { PrimitiveKind } from './primitiveKind.ts';

export type ITypeError<T extends string> = { name: 'CoreTypeError'; type: T };
export type ICuidFactory = () => Effect.Effect<string>;

export type IReference = Readonly<{
  tableName: string;
  columnName: string;
  relation: string;
  inverse: string;
}>;

export type IColumnOptions = {
  nullable?: boolean | undefined;
  unique?: boolean | undefined;
  primaryKey?: boolean | undefined;
  references?: IReference | undefined;
};

export type IValueOptionsByKind = {
  [PrimitiveKind.Boolean]: { defaultValue?: boolean };
  [PrimitiveKind.Integer]: { defaultValue?: number };
  [PrimitiveKind.Number]: { defaultValue?: number };
  [PrimitiveKind.Text]: { defaultValue?: string | null };
  [PrimitiveKind.Date]: { defaultValue?: Date };
  [PrimitiveKind.Enum]: {
    values: readonly [string, ...string[]];
    defaultValue?: string | undefined;
  };
  [PrimitiveKind.Json]: {
    schema: Schema.Codec<unknown, unknown>;
    defaultValue?: null | undefined;
  };
  [PrimitiveKind.Id]: { abbreviation: string };
  [PrimitiveKind.Cursor]: { abbreviation: string };
};

export type IPrimitiveDescriptor = {
  [KIND in keyof IValueOptionsByKind]: Readonly<
    { kind: KIND } & IValueOptionsByKind[KIND] & IColumnOptions
  >;
}[keyof IValueOptionsByKind];

export type IFactoryArgs<OPTIONS> = {} extends OPTIONS
  ? [] | [options: OPTIONS]
  : [options: OPTIONS];
export type IProvidedOptions<ARGS> = ARGS extends [infer OPTIONS]
  ? OPTIONS
  : {};
export type IPrimitiveFactories = {
  [KIND in keyof IValueOptionsByKind]: <
    const ARGS extends IFactoryArgs<IValueOptionsByKind[KIND] & IColumnOptions>,
  >(
    ...args: ARGS
  ) => Readonly<{ kind: KIND } & IProvidedOptions<ARGS>>;
};

export type IShape = Record<string, IPrimitiveDescriptor>;
export type IAnyShapes = Record<string, IShape>;

export type IDrizzleIndexConfig<COLUMN_NAME extends string = string> = {
  name: string;
  columns: readonly [COLUMN_NAME, ...COLUMN_NAME[]];
  unique?: boolean;
  where?: Readonly<{ column: COLUMN_NAME; condition: 'isNull' | 'isNotNull' }>;
};
export type IDrizzleTableConfig<SHAPE extends IShape = IShape> = {
  indexes?: readonly IDrizzleIndexConfig<keyof SHAPE & string>[];
};
export type ITable<
  TABLE_NAME extends string = string,
  SHAPE extends IShape = IShape,
> = Table<TABLE_NAME, SHAPE>;
export type IAnyTable = ITable<string, IShape>;
export type IAnyTables = Record<string, IAnyTable>;

export type IPrimitive = boolean | string | number | Date;
export type IEncodedPrimitive = IPrimitive;
export type IDecodedPrimitive = IPrimitive;
export type IEncodedRecord = Record<string, IEncodedPrimitive>;
export type IDecodedRecord = Record<string, IDecodedPrimitive>;

export type INullPart<D extends IPrimitiveDescriptor> = D extends unknown
  ? 'nullable' extends keyof D
    ? true extends D['nullable']
      ? null
      : never
    : never
  : never;
export type IHasDefault<D extends IPrimitiveDescriptor> =
  'defaultValue' extends keyof D
    ? undefined extends D['defaultValue']
      ? false
      : true
    : false;

type IScalarValue<D extends IPrimitiveDescriptor> = D extends {
  kind: PrimitiveKind.Id | PrimitiveKind.Cursor;
  abbreviation: infer ABBREVIATION extends string;
}
  ? string extends ABBREVIATION
    ? string
    : `${ABBREVIATION}_${string}`
  : D extends {
        kind: PrimitiveKind.Json;
        schema: infer CODEC extends Schema.Codec<unknown, unknown>;
      }
    ? CODEC['Type']
    : D extends {
          kind: PrimitiveKind.Enum;
          values: infer VALUES extends readonly string[];
        }
      ? VALUES[number]
      : D extends { kind: PrimitiveKind.Boolean }
        ? boolean
        : D extends { kind: PrimitiveKind.Date }
          ? Date
          : D extends { kind: PrimitiveKind.Integer | PrimitiveKind.Number }
            ? number
            : string;

export type IPrimitiveDescriptorDecoded<D extends IPrimitiveDescriptor> =
  | IScalarValue<D>
  | INullPart<D>;
export type IPrimitiveDescriptorEncoded<D extends IPrimitiveDescriptor> =
  D extends { kind: PrimitiveKind.Json }
    ? string | INullPart<D>
    : IPrimitiveDescriptorDecoded<D>;
export type IPrimitiveDescriptorPortableEncoded<
  D extends IPrimitiveDescriptor,
> = D extends { kind: PrimitiveKind.Date }
  ? string | INullPart<D>
  : IPrimitiveDescriptorEncoded<D>;
export type IInferDecodedRow<SHAPE extends IShape> = {
  [K in keyof SHAPE]: IPrimitiveDescriptorDecoded<SHAPE[K]>;
};
export type IInferEncodedRow<SHAPE extends IShape> = {
  [K in keyof SHAPE]: IPrimitiveDescriptorEncoded<SHAPE[K]>;
};
export type IInferPortableRow<SHAPE extends IShape> = {
  [K in keyof SHAPE]: IPrimitiveDescriptorPortableEncoded<SHAPE[K]>;
};

type ISqliteTextBuilder = ColumnBuilderBase<{
  dataType: 'string';
  data: string;
  driverParam: unknown;
}>;
type ISqliteNumberBuilder = ColumnBuilderBase<{
  dataType: 'number';
  data: number;
  driverParam: unknown;
}>;
type ISqliteBooleanBuilder = ColumnBuilderBase<{
  dataType: 'number';
  data: boolean;
  driverParam: unknown;
}>;
type ISqliteDateBuilder = ColumnBuilderBase<{
  dataType: 'number';
  data: Date;
  driverParam: unknown;
}>;

type INullableColumn<
  D extends IPrimitiveDescriptor,
  COLUMN extends ColumnBuilderBase,
> = null extends INullPart<D> ? COLUMN : NotNull<COLUMN>;
type IScalarColumn<
  D extends IPrimitiveDescriptor,
  DECODED extends boolean,
> = D extends { kind: PrimitiveKind.Boolean }
  ? INullableColumn<D, ISqliteBooleanBuilder>
  : D extends { kind: PrimitiveKind.Integer | PrimitiveKind.Number }
    ? INullableColumn<D, ISqliteNumberBuilder>
    : D extends { kind: PrimitiveKind.Date }
      ? INullableColumn<D, ISqliteDateBuilder>
      : INullableColumn<
          D,
          $Type<
            ISqliteTextBuilder,
            D extends { kind: PrimitiveKind.Json }
              ? DECODED extends true
                ? IPrimitiveDescriptorDecoded<D>
                : string | INullPart<D>
              : IPrimitiveDescriptorDecoded<D>
          >
        >;
type IDefaultColumn<
  D extends IPrimitiveDescriptor,
  COLUMN extends ColumnBuilderBase,
> = IHasDefault<D> extends true ? HasDefault<COLUMN> : COLUMN;

export type IInferDrizzleColumnBuilderFromDescriptor<
  D extends IPrimitiveDescriptor,
  DECODED extends boolean = false,
> = D extends { primaryKey: true }
  ? IsPrimaryKey<IScalarColumn<D, DECODED>>
  : IDefaultColumn<D, IScalarColumn<D, DECODED>>;
export type IInferDrizzleColumnBuildersFromShape<
  SHAPE extends IShape,
  DECODED extends boolean = false,
> = {
  [K in keyof SHAPE]: IInferDrizzleColumnBuilderFromDescriptor<
    SHAPE[K],
    DECODED
  >;
};
type IDrizzleSQLiteTable<
  MODEL_NAME extends string,
  PROPERTIES extends IShape,
  DECODED extends boolean = false,
> = {
  name: MODEL_NAME;
  schema: undefined;
  columns: BuildColumns<
    MODEL_NAME,
    IInferDrizzleColumnBuildersFromShape<PROPERTIES, DECODED>,
    'sqlite'
  >;
  dialect: 'sqlite';
  isAlias: false;
};
export type IDrizzleSchema<
  MODEL_NAME extends string = string,
  PROPERTIES extends IShape = IShape,
  DECODED extends boolean = false,
> = SQLiteTableWithColumns<
  IDrizzleSQLiteTable<MODEL_NAME, PROPERTIES, DECODED>
>;
export type IAnyDrizzleSchema = AnySQLiteTable;
export type IAnyDrizzleSchemas = Record<string, IAnyDrizzleSchema>;
export type IInferIdFromAbbreviation<ABBREVIATION extends string = string> =
  `${ABBREVIATION}_${string}`;
