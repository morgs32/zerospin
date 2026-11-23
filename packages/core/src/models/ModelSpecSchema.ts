import { encodedShapeSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

/** Complete portable model facts retained by read declarations and mutation codecs. */
export const ModelSpecSchema = Schema.Struct({
  modelName: Schema.NonEmptyString,
  abbreviation: Schema.NonEmptyString,
  version: VersionSchema,
  attributes: Schema.Array(Schema.String),
  attributesShape: encodedShapeSchema,
  propertiesShape: encodedShapeSchema,
  indexes: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      columns: Schema.NonEmptyArray(Schema.String),
      unique: Schema.optionalKey(Schema.Boolean),
      where: Schema.optionalKey(
        Schema.Struct({
          column: Schema.String,
          condition: Schema.Literals(['isNull', 'isNotNull']),
        }),
      ),
    }),
  ),
});
