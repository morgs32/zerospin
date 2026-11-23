import * as Schema from 'effect/Schema';

import { AggregateAgentReleaseSchema } from './AggregateAgentReleaseSchema.ts';
import { ServiceAgentReleaseSchema } from './ServiceAgentReleaseSchema.ts';

export const AgentReleaseSchema = Schema.Union([
  AggregateAgentReleaseSchema,
  ServiceAgentReleaseSchema,
]);

export type IAgentRelease = typeof AgentReleaseSchema.Type;
