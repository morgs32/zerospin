import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';

const admission = {
  issuedNodeId: Schema.NullOr(Schema.NonEmptyString),
  aggregateId: Schema.NonEmptyString,
  aggregateName: Schema.NonEmptyString,
  aggregateVersion: VersionSchema,
  sessionName: Schema.NonEmptyString,
};
const actorAdmission = {
  ...admission,
  claims: Schema.Record(Schema.String, Schema.Unknown),
};

/** Only a resumed live connection can own a pending command admission. */
export const AggregateActorSessionConnectionStateSchema = Schema.Union([
  Schema.Struct({
    ...actorAdmission,
    phase: Schema.Literal('awaiting-resume'),
  }),
  Schema.Struct({
    ...actorAdmission,
    phase: Schema.Literal('replaying'),
    nodeId: Schema.NonEmptyString,
  }),
  Schema.Struct({
    ...actorAdmission,
    phase: Schema.Literal('live'),
    nodeId: Schema.NonEmptyString,
    admissionCommandId: Schema.NullOr(Schema.NonEmptyString),
  }),
]);
export const AggregateAgentSessionConnectionStateSchema = Schema.Union([
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
export type IAggregateActorSessionConnectionState =
  typeof AggregateActorSessionConnectionStateSchema.Type;
export type IAggregateAgentSessionConnectionState =
  typeof AggregateAgentSessionConnectionStateSchema.Type;
export type IAggregateSessionConnectionState =
  | IAggregateActorSessionConnectionState
  | IAggregateAgentSessionConnectionState;
