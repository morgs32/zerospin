import * as Schema from 'effect/Schema';

import { AggregateSessionLockSchema } from '../aggregateSession/AggregateSessionLockSchema.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';

export const ServiceSessionLockSchema = Schema.Struct({
  sessionName: Schema.String,
  actorName: Schema.String,
  actorVersion: VersionSchema,
  contracts: AggregateSessionLockSchema.fields.contracts,
  models: AggregateSessionLockSchema.fields.models,
});

export type IServiceSessionLock = Schema.Schema.Type<
  typeof ServiceSessionLockSchema
>;
