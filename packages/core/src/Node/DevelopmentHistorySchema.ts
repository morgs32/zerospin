import * as Schema from 'effect/Schema';

/** An authenticated local System history and the exact histories replaced by CLI cleans. */
export const DevelopmentHistorySchema = Schema.Struct({
  systemId: Schema.NonEmptyString,
  id: Schema.String.check(Schema.isUUID(4)),
  replaced: Schema.Array(Schema.String.check(Schema.isUUID(4))),
});

export type IDevelopmentHistory = typeof DevelopmentHistorySchema.Type;
