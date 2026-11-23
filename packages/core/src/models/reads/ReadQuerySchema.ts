import * as Schema from 'effect/Schema';

import { VersionSchema } from '../../declaration/VersionSchema.ts';

/** Model identities, visible column names and declarative read options cross RPC. */
export const ReadQuerySchema = Schema.Struct({
  modelName: Schema.NonEmptyString,
  mode: Schema.Literals(['first', 'many']),
  config: Schema.Record(Schema.String, Schema.Unknown),
  models: Schema.Record(
    Schema.String,
    Schema.Struct({
      modelName: Schema.NonEmptyString,
      version: VersionSchema,
      columns: Schema.Array(Schema.NonEmptyString),
    }),
  ),
});
export type IReadQuery = typeof ReadQuerySchema.Type;

export const ReadQueryResultSchema = Schema.Struct({
  rows: Schema.mutable(
    Schema.Array(Schema.mutable(Schema.Array(Schema.Unknown))),
  ),
  compilerVersion: Schema.String,
  layout: Schema.Array(Schema.Json),
});
export type IReadQueryResult = typeof ReadQueryResultSchema.Type;
