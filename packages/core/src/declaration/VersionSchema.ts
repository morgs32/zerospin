import * as Schema from 'effect/Schema';
import * as SchemaGetter from 'effect/SchemaGetter';

/** Exact authored declaration revisions are positive safe integers. */
export const VersionSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

/** Physical routes encode revisions as canonical decimal segments. */
export const VersionFromStringSchema = Schema.String.check(
  Schema.makeFilter(
    value =>
      /^[1-9]\d*$/.test(value) || 'expected a canonical positive integer',
  ),
).pipe(
  Schema.decodeTo(VersionSchema, {
    decode: SchemaGetter.transform(Number),
    encode: SchemaGetter.transform(String),
  }),
);
