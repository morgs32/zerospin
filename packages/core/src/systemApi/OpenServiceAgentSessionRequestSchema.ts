import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

export const OpenServiceAgentSessionRequestSchema = Schema.Struct({
  serviceName: Schema.NonEmptyString,
  serviceVersion: VersionSchema,
  agentName: Schema.NonEmptyString,
  agentVersion: VersionSchema,
  nodeId: Schema.NonEmptyString,
});
export type IOpenServiceAgentSessionRequest =
  typeof OpenServiceAgentSessionRequestSchema.Type;
