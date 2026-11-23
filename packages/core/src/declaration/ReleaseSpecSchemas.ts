import * as Schema from 'effect/Schema';

import { AggregateSpecSchema } from '../aggregate/AggregateSpecSchema.ts';
import { CommandOperationSpecSchema } from '../contracts/ContractOperationsSchema.ts';
import { ContractSpecSchema } from '../contracts/ContractSpecSchema.ts';
import { ModelSpecSchema } from '../models/ModelSpecSchema.ts';
import { SelectionDefinitionSchema } from '../models/SelectionDefinitionSchema.ts';
import { ServiceSpecSchema } from '../service/ServiceSpecSchema.ts';

import { VersionSchema } from './VersionSchema.ts';

const jsonSchema = Schema.Unknown.check(
  Schema.makeFilter(Schema.is(Schema.Json)),
);

const identitySchema = Schema.Struct({
  claimsJsonSchema: jsonSchema,
  identityJsonSchema: jsonSchema,
  pattern: Schema.String,
});
const actorSpecFields = {
  contracts: Schema.Record(Schema.String, VersionSchema),
  name: Schema.String,
  version: VersionSchema,
  identity: identitySchema,
  exposedModels: Schema.Record(Schema.String, ModelSpecSchema),
  selections: Schema.Record(
    Schema.String,
    Schema.Struct({
      modelName: Schema.String,
      definition: SelectionDefinitionSchema,
    }),
  ),
};

export const AggregateActorSpecSchema = Schema.Struct({
  ...actorSpecFields,
  authentication: Schema.Struct({
    credentialsJsonSchema: jsonSchema,
  }),
});
export type IAggregateActorSpec = typeof AggregateActorSpecSchema.Type;

export const ServiceActorSpecSchema = Schema.Struct({
  ...actorSpecFields,
  authentication: Schema.Union([
    Schema.Literal('none'),
    Schema.Struct({ credentialsJsonSchema: jsonSchema }),
  ]),
});
export type IServiceActorSpec = typeof ServiceActorSpecSchema.Type;

export const AgentReleaseSpecFields = {
  name: Schema.String,
  agentVersion: VersionSchema,
  sessionName: Schema.String,
  selectionSemantics: Schema.Literal('selected-rows'),
  contracts: Schema.Record(Schema.String, VersionSchema),
  ownerReleaseVersion: VersionSchema,
  wakeRules: Schema.Record(Schema.NonEmptyString, Schema.NonEmptyString),
  selections: Schema.Record(
    Schema.String,
    Schema.Struct({
      modelName: Schema.String,
      definition: SelectionDefinitionSchema,
    }),
  ),
  models: Schema.Record(Schema.String, ModelSpecSchema),
};

const commandBindings = Schema.Record(
  Schema.String,
  CommandOperationSpecSchema,
);
const releaseContract = Schema.Struct({
  ...ContractSpecSchema.fields,
  commandOperations: commandBindings,
});
const releaseFacts = {
  contracts: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, releaseContract),
  ),
  models: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, ModelSpecSchema),
  ),
};

/** Only the declarations selected by one executable owner release. */
export const ReleaseSpecSchema = Schema.Union([
  Schema.Struct({
    aggregate: AggregateSpecSchema,
    extensionCommandOperations: Schema.Record(Schema.String, commandBindings),
    ...releaseFacts,
    actors: Schema.Record(Schema.String, AggregateActorSpecSchema),
  }),
  Schema.Struct({
    service: ServiceSpecSchema,
    ...releaseFacts,
    actors: Schema.Record(Schema.String, ServiceActorSpecSchema),
  }),
]);
