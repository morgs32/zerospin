import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { ServiceAgentSessionLockSchema } from '@zerospin/core/serviceAgentSession/ServiceAgentSessionLockSchema';
import { ServiceSessionLockSchema } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import * as Schema from 'effect/Schema';

const aggregateFields = {
  aggregateId: Schema.NonEmptyString,
  aggregateName: Schema.NonEmptyString,
  aggregateVersion: VersionSchema,
};
const aggregateActorSessionLockSchema = Schema.Struct({
  ...AggregateSessionLockSchema.fields,
  sessionName: Schema.NonEmptyString,
  origin: Schema.Struct({
    ...AggregateSessionLockSchema.fields.origin.members[0].fields,
    actorName: Schema.NonEmptyString,
  }),
});
const aggregateAgentSessionLockSchema = Schema.Struct({
  ...AggregateSessionLockSchema.fields,
  sessionName: Schema.NonEmptyString,
  origin: AggregateSessionLockSchema.fields.origin.members[1],
});

/** One retained admission tuple selects exactly one physical session owner. */
export const SessionAdmissionSchema = Schema.Union([
  Schema.Struct({
    ...aggregateFields,
    kind: Schema.Literal('aggregateActor'),
    nodeId: Schema.NullOr(Schema.NonEmptyString),
    actorPath: Schema.NonEmptyString,
    claims: Schema.Record(Schema.String, Schema.Unknown),
    aggregateSessionLock: aggregateActorSessionLockSchema,
  }),
  Schema.Struct({
    ...aggregateFields,
    kind: Schema.Literal('aggregateAgent'),
    nodeId: Schema.NonEmptyString,
    aggregateSessionLock: aggregateAgentSessionLockSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal('serviceAgent'),
    nodeId: Schema.NonEmptyString,
    serviceName: Schema.NonEmptyString,
    serviceVersion: VersionSchema,
    serviceAgentSessionLock: ServiceAgentSessionLockSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal('serviceActor'),
    nodeId: Schema.NullOr(Schema.NonEmptyString),
    serviceName: Schema.NonEmptyString,
    serviceVersion: VersionSchema,
    actorPath: Schema.NonEmptyString,
    claims: Schema.Record(Schema.String, Schema.Unknown),
    serviceSessionLock: Schema.Struct({
      ...ServiceSessionLockSchema.fields,
      sessionName: Schema.NonEmptyString,
      actorName: Schema.NonEmptyString,
      actorVersion: VersionSchema,
    }),
  }),
]);

export type ISessionAdmission = typeof SessionAdmissionSchema.Type;
export type ISessionFamily = 'aggregate' | 'service';
export const sessionAdmissionFamily = (
  admission: ISessionAdmission,
): ISessionFamily =>
  admission.kind === 'serviceActor' || admission.kind === 'serviceAgent'
    ? 'service'
    : 'aggregate';
