/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { PublicFailureSchema } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';
import * as Tuple from 'effect/Tuple';

import { VersionSchema } from '../declaration/VersionSchema.ts';

import { CommandOutcomeSchema } from './CommandOutcomeSchema.ts';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
  IAggregateSessionSubmissionInput,
} from './types.ts';

const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
const commandFields = {
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.Unknown,
  contractVersion: VersionSchema,
};
const aggregateFields = {
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  aggregateVersion: VersionSchema,
};
const serviceFields = {
  serviceName: Schema.String,
  serviceVersion: VersionSchema,
};

/** Actor submissions retain their authenticated identity and complete Node position. */
export const ActorCommandSchema = Schema.Struct({
  ...commandFields,
  kind: Schema.Literal('actor'),
  actorName: Schema.NonEmptyString,
  actorVersion: VersionSchema,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  nodeId: Schema.NonEmptyString,
  sessionName: Schema.NonEmptyString,
  pushIndex: positiveIndexSchema,
});
export const AgentCommandSchema = Schema.Struct({
  ...commandFields,
  kind: Schema.Literal('agent'),
  agentName: Schema.NonEmptyString,
  agentVersion: VersionSchema,
});
export const SystemCommandSchema = Schema.Struct({
  ...commandFields,
  kind: Schema.Literal('system'),
});
export const ActorAggregateCommandSchema = Schema.Struct({
  ...ActorCommandSchema.fields,
  ...aggregateFields,
});
export const AgentAggregateCommandSchema = Schema.Struct({
  ...AgentCommandSchema.fields,
  ...aggregateFields,
});
export const SystemAggregateCommandSchema = Schema.Struct({
  ...SystemCommandSchema.fields,
  ...aggregateFields,
});
export const UnknownAggregateCommandSchema = Schema.Union([
  ActorAggregateCommandSchema,
  AgentAggregateCommandSchema,
  SystemAggregateCommandSchema,
]) satisfies Schema.Codec<IAggregateCommand, any>;

export const ActorServiceCommandSchema = Schema.Struct({
  ...ActorCommandSchema.fields,
  ...serviceFields,
});
export const AgentServiceCommandSchema = Schema.Struct({
  ...AgentCommandSchema.fields,
  ...serviceFields,
});
export const SystemServiceCommandSchema = Schema.Struct({
  ...SystemCommandSchema.fields,
  ...serviceFields,
});
export const UnknownServiceCommandSchema = Schema.Union([
  ActorServiceCommandSchema,
  AgentServiceCommandSchema,
  SystemServiceCommandSchema,
]) satisfies Schema.Codec<IServiceCommand, any>;

/** Command payloads are decoded under their ordinary contract before evaluation. */
export const DecodedAggregateCommandSchema = UnknownAggregateCommandSchema;
export const DecodedServiceCommandSchema = UnknownServiceCommandSchema;

export const EncodedActorAggregateCommandSchema = Schema.Struct({
  ...ActorAggregateCommandSchema.fields,
  payload: Schema.String,
});
export const EncodedAgentAggregateCommandSchema = Schema.Struct({
  ...AgentAggregateCommandSchema.fields,
  payload: Schema.String,
});
export const EncodedSystemAggregateCommandSchema = Schema.Struct({
  ...SystemAggregateCommandSchema.fields,
  payload: Schema.String,
});
export const EncodedAggregateCommandSchema = Schema.Union([
  EncodedActorAggregateCommandSchema,
  EncodedAgentAggregateCommandSchema,
  EncodedSystemAggregateCommandSchema,
]) satisfies Schema.Codec<IEncodedCommand<IAggregateCommand>, any>;

/** Retained System children can lack a payload when their mapper failed. */
export const RetainedSystemAggregateCommandSchema = Schema.Union([
  EncodedSystemAggregateCommandSchema,
  Schema.Struct({
    ...EncodedSystemAggregateCommandSchema.fields,
    payload: Schema.Null,
  }),
]);
export const RetainedAggregateCommandSchema = Schema.Union([
  EncodedActorAggregateCommandSchema,
  EncodedAgentAggregateCommandSchema,
  ...RetainedSystemAggregateCommandSchema.members,
]);

export const EncodedActorServiceCommandSchema = Schema.Struct({
  ...ActorServiceCommandSchema.fields,
  payload: Schema.String,
});
export const EncodedAgentServiceCommandSchema = Schema.Struct({
  ...AgentServiceCommandSchema.fields,
  payload: Schema.String,
});
export const EncodedSystemServiceCommandSchema = Schema.Struct({
  ...SystemServiceCommandSchema.fields,
  payload: Schema.String,
});
export const EncodedServiceCommandSchema = Schema.Union([
  EncodedActorServiceCommandSchema,
  EncodedAgentServiceCommandSchema,
  EncodedSystemServiceCommandSchema,
]) satisfies Schema.Codec<IEncodedCommand<IServiceCommand>, any>;

/** Retained System children can lack a payload when their mapper failed. */
export const RetainedSystemServiceCommandSchema = Schema.Union([
  EncodedSystemServiceCommandSchema,
  Schema.Struct({
    ...EncodedSystemServiceCommandSchema.fields,
    payload: Schema.Null,
  }),
]);
export const RetainedServiceCommandSchema = Schema.Union([
  EncodedActorServiceCommandSchema,
  EncodedAgentServiceCommandSchema,
  ...RetainedSystemServiceCommandSchema.members,
]);

/** Session drafts precede Node allocation and are not submitted Actor commands. */
export const EncodedAggregateSessionSubmissionSchema = Schema.Struct({
  ...Struct.omit(EncodedActorAggregateCommandSchema.fields, [
    'id',
    'nodeId',
    'pushIndex',
  ]),
  sessionId: makeAbbreviationIdSchema('sesn'),
}) satisfies Schema.Codec<
  IEncodedCommand<IAggregateSessionSubmissionInput>,
  any
>;

/** Service session commands before the Node assigns identity and position. */
export const ServiceSessionSubmissionSchema = Schema.Struct(
  Struct.omit(ActorServiceCommandSchema.fields, [
    'id',
    'nodeId',
    'pushIndex',
    'serviceVersion',
  ]),
);

const LowercaseSha256Schema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);
const commandResults = {
  payloadFailure: Schema.optionalKey(PublicFailureSchema),
  outcome: Schema.NullOr(CommandOutcomeSchema),
  dispositionChainHash: Schema.NullOr(LowercaseSha256Schema),
};
export const ServiceChainedCommandSchema =
  RetainedServiceCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...commandResults,
        serviceIndex: positiveIndexSchema,
      }),
    ),
  );
export const AggregateChainedCommandSchema =
  RetainedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...commandResults,
        aggregateIndex: positiveIndexSchema,
      }),
    ),
  );

/** Fresh direct System invocations are allocated only inside the admitting Chain. */
export const DirectSystemAggregateCommandSchema = Schema.Struct(
  Struct.omit(EncodedSystemAggregateCommandSchema.fields, ['id']),
);
export const DirectSystemServiceCommandSchema = Schema.Struct(
  Struct.omit(EncodedSystemServiceCommandSchema.fields, ['id']),
);
