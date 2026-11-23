import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

export const AggregateSessionLockSchema = Schema.Struct({
  sessionName: Schema.String,
  origin: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal('actor'),
      actorName: Schema.String,
      actorVersion: VersionSchema,
    }),
    Schema.Struct({
      kind: Schema.Literal('agent'),
      agentName: Schema.NonEmptyString,
      agentVersion: VersionSchema,
    }),
  ]),
  models: Schema.Record(
    Schema.String,
    Schema.Struct({
      modelName: Schema.String,
      version: VersionSchema,
    }),
  ),
  contracts: Schema.Record(
    Schema.String,
    Schema.Struct({
      commandName: Schema.String,
      version: VersionSchema,
    }),
  ),
});

export type IAggregateSessionLock = Schema.Schema.Type<
  typeof AggregateSessionLockSchema
>;

export type IAggregateActorSessionLock = Omit<
  IAggregateSessionLock,
  'origin'
> & {
  readonly origin: Extract<IAggregateSessionLock['origin'], { kind: 'actor' }>;
};
