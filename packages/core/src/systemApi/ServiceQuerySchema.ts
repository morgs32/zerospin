import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';
import { ReadQuerySchema } from '../models/reads/ReadQuerySchema.ts';

/** One declarative read against an exact service release. */
export const ServiceQuerySchema = Schema.fieldsAssign({
  serviceName: Schema.String,
  serviceVersion: VersionSchema,
})(ReadQuerySchema);

export type IServiceQuery = typeof ServiceQuerySchema.Type;
