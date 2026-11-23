import * as Schema from 'effect/Schema';

/** Only successful local staging creates a retained command. */
export const StagingOutcomeSchema = Schema.Struct({
  result: Schema.Json,
  completedAt: Schema.DateFromString,
});
