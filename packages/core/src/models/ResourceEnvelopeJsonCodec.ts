import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

import type { IEncodedResourceShape } from './types.ts';

export const ResourceEnvelopeJsonCodec: Schema.Codec<
  IEncodedResourceShape,
  unknown
> = Schema.StructWithRest(
  Schema.Struct({
    createdAt: Schema.DateFromString,
    id: Schema.String,
    modelName: Schema.String,
    updatedAt: Schema.DateFromString,
    version: VersionSchema,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
