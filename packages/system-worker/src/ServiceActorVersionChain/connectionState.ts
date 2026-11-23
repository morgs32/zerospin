import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

const admission = {
  issuedNodeId: Schema.NullOr(Schema.NonEmptyString),
  serviceName: Schema.NonEmptyString,
  serviceVersion: VersionSchema,
  actorName: Schema.NonEmptyString,
  actorVersion: VersionSchema,
  actorPath: Schema.NonEmptyString,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  sessionName: Schema.NonEmptyString,
};
export const ServiceConnectionStateSchema = Schema.Union([
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
    admissionCommandId: Schema.NullOr(Schema.NonEmptyString),
  }),
]);
export type IServiceConnectionState = typeof ServiceConnectionStateSchema.Type;
