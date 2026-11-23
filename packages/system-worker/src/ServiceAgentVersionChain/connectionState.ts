import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

const admission = {
  issuedNodeId: Schema.NonEmptyString,
  serviceName: Schema.NonEmptyString,
  serviceVersion: VersionSchema,
  agentName: Schema.NonEmptyString,
  agentVersion: VersionSchema,
  sessionName: Schema.NonEmptyString,
};

export const ServiceAgentConnectionStateSchema = Schema.Union([
  Schema.Struct({ ...admission, phase: Schema.Literal('awaiting-resume') }),
  Schema.Struct({
    ...admission,
    phase: Schema.Literal('replaying'),
    nodeId: Schema.NonEmptyString,
  }),
  Schema.Struct({
    ...admission,
    phase: Schema.Literal('live'),
    nodeId: Schema.NonEmptyString,
  }),
]);
export type IServiceAgentConnectionState =
  typeof ServiceAgentConnectionStateSchema.Type;
