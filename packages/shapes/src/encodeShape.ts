import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { captureDescriptor } from './captureDescriptor.ts';
import { SafeIntegerSchema } from './compileDescriptor.ts';
import { PrimitiveKind } from './primitiveKind.ts';
import type { IShape } from './types.ts';

const referenceFields = Schema.Struct({
  tableName: Schema.NonEmptyString,
  columnName: Schema.NonEmptyString,
  relation: Schema.NonEmptyString,
  inverse: Schema.NonEmptyString,
});
const columnFields = {
  nullable: Schema.Boolean,
  unique: Schema.Boolean,
  primaryKey: Schema.Literal(false),
};
const keyColumnFields = {
  ...columnFields,
  primaryKey: Schema.Boolean,
  references: Schema.optionalKey(referenceFields),
};

const encodedPrimitiveDescriptorSchema = Schema.Union([
  Schema.Struct({
    ...columnFields,
    kind: Schema.Literal(PrimitiveKind.Boolean),
    defaultValue: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.Struct({
    ...columnFields,
    kind: Schema.Literal(PrimitiveKind.Cursor),
    abbreviation: Schema.NonEmptyString,
  }),
  Schema.Struct({
    ...keyColumnFields,
    kind: Schema.Literal(PrimitiveKind.Id),
    abbreviation: Schema.NonEmptyString,
  }),
  Schema.Struct({
    ...keyColumnFields,
    kind: Schema.Literal(PrimitiveKind.Integer),
    defaultValue: Schema.optionalKey(SafeIntegerSchema),
  }),
  Schema.Struct({
    ...columnFields,
    kind: Schema.Literal(PrimitiveKind.Number),
    defaultValue: Schema.optionalKey(Schema.Finite),
  }),
  Schema.Struct({
    ...keyColumnFields,
    kind: Schema.Literal(PrimitiveKind.Text),
    defaultValue: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
  Schema.Struct({
    ...columnFields,
    kind: Schema.Literal(PrimitiveKind.Date),
    defaultValue: Schema.optionalKey(
      Schema.String.check(
        Schema.makeFilter(value => !Number.isNaN(Date.parse(value))),
      ),
    ),
  }),
  Schema.Struct({
    ...columnFields,
    kind: Schema.Literal(PrimitiveKind.Enum),
    values: Schema.NonEmptyArray(Schema.String),
    defaultValue: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    ...columnFields,
    unique: Schema.Literal(false),
    kind: Schema.Literal(PrimitiveKind.Json),
    schema: Schema.Struct({
      dialect: Schema.Literal('draft-2020-12'),
      schema: Schema.Any,
      definitions: Schema.Record(Schema.String, Schema.Any),
    }),
    defaultValue: Schema.optionalKey(Schema.Null),
  }),
]).check(
  Schema.makeFilter(descriptor => {
    const value =
      'defaultValue' in descriptor ? descriptor.defaultValue : undefined;
    if (descriptor.primaryKey && (descriptor.nullable || value !== undefined)) {
      return 'Primary key cannot be nullable or defaulted';
    }
    if (value === null && !descriptor.nullable) {
      return 'Null default requires a nullable field';
    }
    if (
      descriptor.kind === PrimitiveKind.Enum &&
      descriptor.defaultValue !== undefined &&
      !descriptor.values.includes(descriptor.defaultValue)
    ) {
      return 'Enum default must be a declared value';
    }
    return true;
  }),
);

export const encodedShapeSchema = Schema.Record(
  Schema.String,
  encodedPrimitiveDescriptorSchema,
);

export type IEncodedShape = typeof encodedShapeSchema.Type;

/** Encode the portable value contract while retaining plain relationship metadata. */
export function encodeShape(shape: IShape): IEncodedShape {
  const encoded = mapValues(shape, descriptor => {
    const owned = captureDescriptor(descriptor);
    switch (owned.kind) {
      case PrimitiveKind.Json:
        return { ...owned, schema: Schema.toJsonSchemaDocument(owned.schema) };
      case PrimitiveKind.Date: {
        const { defaultValue, ...date } = owned;
        return {
          ...date,
          ...(defaultValue === undefined
            ? {}
            : { defaultValue: defaultValue.toISOString() }),
        };
      }
      default:
        return owned;
    }
  });
  return Schema.decodeUnknownSync(encodedShapeSchema, {
    onExcessProperty: 'error',
  })(encoded);
}
