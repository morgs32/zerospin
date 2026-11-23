/** Agent identity for Agent snapshots and trusted socket headers. */
import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

export const AgentOriginSchema = Schema.Struct({
  kind: Schema.Literal('agent'),
  agentName: Schema.NonEmptyString,
  agentVersion: VersionSchema,
});
export type IAgentOrigin = typeof AgentOriginSchema.Type;
