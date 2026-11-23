import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';
import { ResourceEnvelopeJsonCodec } from '../models/ResourceEnvelopeJsonCodec.ts';
import {
  ServiceDispositionChainHashSchema,
  ServiceNonNegativeIndexSchema,
} from '../serviceSession/ServiceSocketProtocolSchema.ts';

/** Service Agent snapshots contain selected resources and their matching durable checkpoint. */
export const ServiceAgentSessionSnapshotSchema = Schema.Struct({
  environment: Schema.Literals(['dev', 'production']),
  serviceIndex: ServiceNonNegativeIndexSchema,
  dispositionChainHash: ServiceDispositionChainHashSchema,
  serviceName: Schema.NonEmptyString,
  serviceVersion: VersionSchema,
  agentName: Schema.NonEmptyString,
  agentVersion: VersionSchema,
  sessionName: Schema.NonEmptyString,
  resources: Schema.Array(ResourceEnvelopeJsonCodec),
});
export type IServiceAgentSessionSnapshot =
  typeof ServiceAgentSessionSnapshotSchema.Type;
