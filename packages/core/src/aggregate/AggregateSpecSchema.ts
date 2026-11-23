import * as Schema from 'effect/Schema';

import { ContractOperationsSchema } from '../contracts/ContractOperationsSchema.ts';
import { ContractSpecSchema } from '../contracts/ContractSpecSchema.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';

/** Exact owner release bindings resolve through the enclosing SystemSpec registries. */
export const AggregateSpecSchema = Schema.Struct({
  name: Schema.String,
  version: VersionSchema,
  branchFrom: Schema.optionalKey(VersionSchema),
  rebuildFrom: Schema.optionalKey(VersionSchema),
  models: Schema.Record(Schema.String, VersionSchema),
  contracts: Schema.Record(Schema.String, VersionSchema),
  system: Schema.Record(Schema.String, VersionSchema),
  external: Schema.Record(Schema.String, VersionSchema),
  actors: Schema.Record(Schema.String, VersionSchema),
  extensions: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        sourceVersion: VersionSchema,
        models: ContractSpecSchema.fields.models,
        operations: ContractOperationsSchema,
      }),
    ),
  ),
}).check(
  Schema.makeFilter(
    release =>
      release.branchFrom === undefined ||
      release.rebuildFrom === undefined ||
      'An Aggregate release can only name one predecessor',
  ),
);
export type IAggregateSpec = typeof AggregateSpecSchema.Type;
