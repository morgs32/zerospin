import * as Schema from 'effect/Schema';

import { ContractExtensionsSpecSchema } from '../contracts/ContractSpecSchema.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';

/** Exact owner release bindings resolve through the enclosing SystemSpec registries. */
export const ServiceSpecSchema = Schema.Struct({
  name: Schema.String,
  version: VersionSchema,
  models: Schema.Record(Schema.String, VersionSchema),
  contracts: Schema.Record(Schema.String, VersionSchema),
  system: Schema.Record(Schema.String, VersionSchema),
  external: Schema.Record(Schema.String, VersionSchema),
  extensions: Schema.optionalKey(ContractExtensionsSpecSchema),
  actors: Schema.Record(Schema.String, VersionSchema),
});
export type IServiceSpec = typeof ServiceSpecSchema.Type;
