import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { hashNodeValue } from '@zerospin/core/Node/sessionKey';
import * as Schema from 'effect/Schema';
export const AggregateNodeRequestSchema = Schema.Struct({
  apiUrl: Schema.String,
  publishableKey: Schema.String,
  systemName: Schema.String,
  aggregateName: Schema.String,
  aggregateVersion: VersionSchema,
  sessionName: Schema.String,
  lock: AggregateSessionLockSchema,
});
export type IAggregateNodeRequest = typeof AggregateNodeRequestSchema.Type;

export const makeAggregateSharedWorkerRoutingKey = (
  request: IAggregateNodeRequest,
  aggregateId: string,
) => hashNodeValue({ request, aggregateId });
