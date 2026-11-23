import { PublicFailureSchema } from '@zerospin/error';
import * as Schema from 'effect/Schema';

/** The first terminal command result and its finalization time; replay and delivery preserve both. */
export const CommandOutcomeSchema = Schema.Struct({
  result: Schema.Union([
    Schema.Struct({
      _tag: Schema.Literal('Success'),
      success: Schema.Json,
    }),
    Schema.Struct({
      _tag: Schema.Literal('Failure'),
      failure: PublicFailureSchema,
    }),
  ]),
  finalizedAt: Schema.DateFromString,
});
export type ICommandOutcome = typeof CommandOutcomeSchema.Type;
