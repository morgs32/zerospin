import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { hashNodeValue } from '@zerospin/core/Node/sessionKey';
import { ServiceSessionLockSchema } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import * as Schema from 'effect/Schema';
export const ServiceNodeRequestSchema = Schema.Struct({
  apiUrl: Schema.String,
  publishableKey: Schema.String,
  systemName: Schema.String,
  serviceName: Schema.String,
  serviceVersion: VersionSchema,
  sessionName: Schema.String,
  lock: ServiceSessionLockSchema,
});
export type IServiceNodeRequest = typeof ServiceNodeRequestSchema.Type;

export const makeServiceSharedWorkerRoutingKey = (
  request: IServiceNodeRequest,
) => hashNodeValue(request);
