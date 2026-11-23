import { encodedShapeSchema } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

import { ContractOperationsSchema } from './ContractOperationsSchema.ts';

// Effect documents expose unknown keyword values; receivers still require JSON.
const jsonSchema = Schema.Unknown.check(
  Schema.makeFilter(Schema.is(Schema.Json)),
);

/** Complete portable facts owned by one contract version, without runtime lineage. */
export const ContractSpecSchema = Schema.Struct({
  commandName: Schema.NonEmptyString,
  version: VersionSchema,
  payloadShape: encodedShapeSchema,
  claimsJsonSchema: jsonSchema,
  failureJsonSchema: jsonSchema,
  resultJsonSchema: jsonSchema,
  models: Schema.Record(
    Schema.String,
    Schema.Struct({
      abbreviation: Schema.NonEmptyString,
      fields: encodedShapeSchema,
    }),
  ),
  operations: ContractOperationsSchema,
  operationsJsonSchema: jsonSchema,
  external: Schema.optionalKey(
    Schema.Struct({
      responseJsonSchema: jsonSchema,
      timeoutMs: Schema.Number,
      onSuccess: Schema.Struct({
        commandName: Schema.NonEmptyString,
        version: VersionSchema,
      }),
      onFailure: Schema.Struct({
        commandName: Schema.NonEmptyString,
        version: VersionSchema,
      }),
    }),
  ),
});

export const ContractExtensionsSpecSchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    sourceVersion: VersionSchema,
    models: ContractSpecSchema.fields.models,
    operations: ContractOperationsSchema,
  }),
);
