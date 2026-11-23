import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { makeAbbreviationIdSchema } from './makeAbbreviationIdSchema.ts';
import { PrimitiveKind } from './primitiveKind.ts';
import type { IPrimitiveDescriptor } from './types.ts';

export const SafeIntegerSchema = Schema.Int.check(
  Schema.isBetween({
    minimum: Number.MIN_SAFE_INTEGER,
    maximum: Number.MAX_SAFE_INTEGER,
  }),
);

const valueOptionNames = {
  [PrimitiveKind.Boolean]: ['defaultValue'],
  [PrimitiveKind.Cursor]: ['abbreviation'],
  [PrimitiveKind.Date]: ['defaultValue'],
  [PrimitiveKind.Enum]: ['values', 'defaultValue'],
  [PrimitiveKind.Id]: ['abbreviation'],
  [PrimitiveKind.Integer]: ['defaultValue'],
  [PrimitiveKind.Json]: ['schema', 'defaultValue'],
  [PrimitiveKind.Number]: ['defaultValue'],
  [PrimitiveKind.Text]: ['defaultValue'],
} satisfies Record<PrimitiveKind, readonly string[]>;

/** Validate authored scalar options before any codec or database can consume them. */
export function validatePrimitiveDescriptor(
  descriptor: IPrimitiveDescriptor,
): void {
  if (
    typeof descriptor !== 'object' ||
    descriptor === null ||
    !Object.hasOwn(valueOptionNames, descriptor.kind)
  ) {
    throw new Error('Unsupported primitive descriptor kind');
  }
  const allowed = new Set<string>([
    'kind',
    'nullable',
    'unique',
    'primaryKey',
    'references',
    ...valueOptionNames[descriptor.kind],
  ]);
  if (Object.keys(descriptor).some(key => !allowed.has(key))) {
    throw new Error('Unknown primitive option');
  }
  for (const flag of ['nullable', 'unique', 'primaryKey'] as const) {
    if (
      descriptor[flag] !== undefined &&
      typeof descriptor[flag] !== 'boolean'
    ) {
      throw new Error(`Primitive ${flag} must be boolean`);
    }
  }
  const supportsKeys =
    descriptor.kind === PrimitiveKind.Id ||
    descriptor.kind === PrimitiveKind.Integer ||
    descriptor.kind === PrimitiveKind.Text;
  if (
    (descriptor.primaryKey === true || descriptor.references !== undefined) &&
    !supportsKeys
  ) {
    throw new Error(
      'Only ID, integer and text columns support primary keys or references',
    );
  }
  if (
    descriptor.primaryKey === true &&
    (descriptor.nullable === true ||
      ('defaultValue' in descriptor && descriptor.defaultValue !== undefined))
  ) {
    throw new Error('Primary key cannot be nullable or defaulted');
  }
  if (descriptor.references !== undefined) {
    const reference = descriptor.references;
    if (
      typeof reference !== 'object' ||
      reference === null ||
      Array.isArray(reference) ||
      Object.keys(reference).some(
        key =>
          !['tableName', 'columnName', 'relation', 'inverse'].includes(key),
      ) ||
      [
        reference.tableName,
        reference.columnName,
        reference.relation,
        reference.inverse,
      ].some(value => typeof value !== 'string' || value === '')
    ) {
      throw new Error(
        'Reference requires non-empty tableName, columnName, relation and inverse',
      );
    }
  }
  switch (descriptor.kind) {
    case PrimitiveKind.Id:
    case PrimitiveKind.Cursor:
      if (
        typeof descriptor.abbreviation !== 'string' ||
        descriptor.abbreviation === ''
      ) {
        throw new Error('Primitive abbreviation must be non-empty');
      }
      break;
    case PrimitiveKind.Enum:
      if (
        !Array.isArray(descriptor.values) ||
        descriptor.values.length === 0 ||
        descriptor.values.some(value => typeof value !== 'string')
      ) {
        throw new Error('Enum values must be a non-empty string array');
      }
      break;
    case PrimitiveKind.Json:
      if (!Schema.isSchema(descriptor.schema)) {
        throw new Error('JSON requires an authored Effect codec');
      }
      if (descriptor.unique === true) {
        throw new Error('JSON does not support unique columns');
      }
      if (
        descriptor.defaultValue !== undefined &&
        (descriptor.defaultValue !== null || descriptor.nullable !== true)
      ) {
        throw new Error('JSON only permits a nullable null default');
      }
      break;
    default:
      break;
  }
  if ('defaultValue' in descriptor && descriptor.defaultValue !== undefined) {
    if (
      descriptor.defaultValue === null &&
      descriptor.kind !== PrimitiveKind.Text &&
      descriptor.kind !== PrimitiveKind.Json
    ) {
      throw new Error('This primitive does not permit a null default');
    }
    Schema.decodeUnknownSync(Schema.toType(makeScalarSchema(descriptor)))(
      descriptor.defaultValue,
    );
  }
}

function makeScalarSchema(
  descriptor: IPrimitiveDescriptor,
): Schema.Codec<unknown, unknown> {
  let schema: Schema.Codec<unknown, unknown>;
  switch (descriptor.kind) {
    case PrimitiveKind.Boolean:
      schema = Schema.Boolean;
      break;
    case PrimitiveKind.Integer:
      schema = SafeIntegerSchema;
      break;
    case PrimitiveKind.Number:
      schema = Schema.Finite;
      break;
    case PrimitiveKind.Text:
      schema = Schema.String;
      break;
    case PrimitiveKind.Date:
      schema = Schema.Date;
      break;
    case PrimitiveKind.Enum:
      schema = Schema.Literals(descriptor.values);
      break;
    case PrimitiveKind.Json:
      schema = Schema.fromJsonString(descriptor.schema);
      break;
    case PrimitiveKind.Id:
    case PrimitiveKind.Cursor:
      schema = makeAbbreviationIdSchema(descriptor.abbreviation);
      break;
    default:
      throw new Error('Unsupported primitive descriptor kind');
  }
  return descriptor.nullable === true ? Schema.NullOr(schema) : schema;
}

/** Compile one scalar meaning while keeping stored rows and portable values distinct. */
export function compileDescriptor(descriptor: IPrimitiveDescriptor) {
  validatePrimitiveDescriptor(descriptor);
  const rowCodec = makeScalarSchema(descriptor);
  const portableCodec =
    descriptor.kind === PrimitiveKind.Date
      ? descriptor.nullable === true
        ? Schema.NullOr(Schema.DateFromString)
        : Schema.DateFromString
      : rowCodec;
  const value =
    'defaultValue' in descriptor ? descriptor.defaultValue : undefined;
  const defaultMillis = value instanceof Date ? value.getTime() : undefined;
  const defaultValue =
    value === undefined
      ? undefined
      : () => (defaultMillis === undefined ? value : new Date(defaultMillis));
  const defaultedRowCodec =
    defaultValue === undefined
      ? rowCodec
      : rowCodec.pipe(
          Schema.withDecodingDefaultTypeKey(Effect.sync(defaultValue)),
        );
  return {
    rowCodec,
    decodedSchema: Schema.toType(rowCodec),
    portableCodec,
    defaultValue,
    defaultedRowCodec,
  };
}
