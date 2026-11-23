import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

const jsonSchema = Schema.Unknown.check(
  Schema.makeFilter(Schema.is(Schema.Json)),
);

const continuationBranch = Schema.optionalKey(
  Schema.Struct({
    commandName: Schema.NonEmptyString,
    version: VersionSchema,
  }),
);

export const CommandOperationSpecSchema = Schema.Struct({
  operationName: Schema.Literal('command'),
  family: Schema.Literals(['aggregate', 'service']),
  destinationName: Schema.NonEmptyString,
  destinationVersion: VersionSchema,
  contractName: Schema.NonEmptyString,
  contractVersion: VersionSchema,
  payloadJsonSchema: jsonSchema,
  onSuccess: continuationBranch,
  onFailure: continuationBranch,
});

/** Portable operation declarations retained in SystemSpec. */
export const ContractOperationsSchema = Schema.Array(
  Schema.Union([
    Schema.Struct({
      operationName: Schema.Literals(['create', 'update', 'delete', 'move']),
      model: Schema.Struct({
        modelName: Schema.NonEmptyString,
        version: VersionSchema,
      }),
    }),
    Schema.Struct({
      operationName: Schema.Literal('external'),
      family: Schema.Literals(['aggregate', 'service']),
      contractName: Schema.NonEmptyString,
      contractVersion: VersionSchema,
      payloadJsonSchema: jsonSchema,
    }),
    CommandOperationSpecSchema,
  ]),
);
