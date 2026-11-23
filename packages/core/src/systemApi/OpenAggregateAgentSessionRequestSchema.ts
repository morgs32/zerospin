import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

export const OpenAggregateAgentSessionRequestSchema = Schema.Struct({
  aggregateName: Schema.NonEmptyString,
  aggregateVersion: VersionSchema,
  aggregateId: Schema.NonEmptyString,
  agentName: Schema.NonEmptyString,
  agentVersion: VersionSchema,
  nodeId: Schema.NonEmptyString,
});
export type IOpenAggregateAgentSessionRequest =
  typeof OpenAggregateAgentSessionRequestSchema.Type;
