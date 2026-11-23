import * as Schema from 'effect/Schema';

export const AggregateAuthenticationRequestSchema = Schema.Struct({
  aggregateId: Schema.String,
  credentials: Schema.Unknown,
});
