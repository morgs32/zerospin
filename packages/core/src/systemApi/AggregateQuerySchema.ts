import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';
import { ReadQuerySchema } from '../models/reads/ReadQuerySchema.ts';

/** One declarative read against an exact aggregate release and instance. */
export const AggregateQuerySchema = Schema.fieldsAssign({
  aggregateName: Schema.String,
  aggregateVersion: VersionSchema,
  aggregateId: Schema.String,
})(ReadQuerySchema);

export type IAggregateQuery = typeof AggregateQuerySchema.Type;
