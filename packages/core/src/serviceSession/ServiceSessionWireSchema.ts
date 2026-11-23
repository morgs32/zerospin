/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import * as Schema from 'effect/Schema';

import { BrowserCommandSchema } from '../contracts/BrowserCommandSchema.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';
import { ResourceEnvelopeJsonCodec } from '../models/ResourceEnvelopeJsonCodec.ts';
import { DevelopmentHistorySchema } from '../Node/DevelopmentHistorySchema.ts';

import type {
  IServiceExposedCommand,
  IServiceSessionSnapshot,
} from './types.ts';
const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);
const nonNegativeIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);
const DispositionChainHashSchema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);
export const ServiceExposedCommandSchema = Schema.fieldsAssign({
  serviceIndex: positiveIndexSchema,
  dispositionChainHash: DispositionChainHashSchema,
})(BrowserCommandSchema) satisfies Schema.Codec<IServiceExposedCommand, any>;
export const ServiceSessionSnapshotSchema = Schema.Struct({
  environment: Schema.Literals(['dev', 'production']),
  developmentHistory: Schema.optionalKey(DevelopmentHistorySchema),
  resolvedThrough: nonNegativeIndexSchema,
  serviceIndex: nonNegativeIndexSchema,
  actorName: Schema.String,
  actorVersion: VersionSchema,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  serviceName: Schema.String,
  sessionName: Schema.String,
  dispositionChainHash: DispositionChainHashSchema,
  serviceVersion: VersionSchema,
  resources: Schema.Array(ResourceEnvelopeJsonCodec),
}) satisfies Schema.Codec<IServiceSessionSnapshot, any>;
