import * as Schema from 'effect/Schema';

import { AggregateSessionLockSchema } from '../aggregateSession/AggregateSessionLockSchema.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';

export const ServiceAgentSessionLockSchema = Schema.Struct({
  sessionName: Schema.NonEmptyString,
  agentName: Schema.NonEmptyString,
  agentVersion: VersionSchema,
  models: AggregateSessionLockSchema.fields.models,
  contracts: AggregateSessionLockSchema.fields.contracts,
});

export type IServiceAgentSessionLock =
  typeof ServiceAgentSessionLockSchema.Type;
