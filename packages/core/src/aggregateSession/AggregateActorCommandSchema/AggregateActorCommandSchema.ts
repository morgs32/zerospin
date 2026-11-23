/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import * as Schema from 'effect/Schema';

import { BrowserCommandSchema } from '../../contracts/BrowserCommandSchema.ts';
import { EncodedAggregateSessionSubmissionSchema } from '../../contracts/CommandSchema.ts';
import { StagingOutcomeSchema } from '../../contracts/StagingOutcomeSchema.ts';
import { VersionSchema } from '../../declaration/VersionSchema.ts';
import { ResourceEnvelopeJsonCodec } from '../../models/ResourceEnvelopeJsonCodec.ts';
import { DevelopmentHistorySchema } from '../../Node/DevelopmentHistorySchema.ts';
import type {
  IAggregateExposedCommand,
  IAggregateSessionSnapshot,
} from '../types.ts';

const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  Schema.isGreaterThan(0),
);

const nonNegativeIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
  Schema.isGreaterThanOrEqualTo(0),
);

const LowercaseSha256Schema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);

export const AggregateExposedCommandSchema = Schema.fieldsAssign({
  aggregateIndex: positiveIndexSchema,
  dispositionChainHash: LowercaseSha256Schema,
})(BrowserCommandSchema) satisfies Schema.Codec<IAggregateExposedCommand, any>;

export const SessionSubmissionSchema = Schema.fieldsAssign({
  sessionIndex: positiveIndexSchema,
  stagingOutcome: StagingOutcomeSchema,
})(EncodedAggregateSessionSubmissionSchema);

export const AggregateSessionSnapshotSchema = Schema.Struct({
  environment: Schema.Literals(['dev', 'production']),
  developmentHistory: Schema.optionalKey(DevelopmentHistorySchema),
  aggregateId: Schema.String,
  actorName: Schema.NonEmptyString,
  actorVersion: VersionSchema,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  aggregateName: Schema.String,
  aggregateVersion: VersionSchema,
  sessionName: Schema.String,
  aggregateIndex: nonNegativeIndexSchema,
  dispositionChainHash: LowercaseSha256Schema,
  resolvedThrough: nonNegativeIndexSchema,
  resources: Schema.Array(ResourceEnvelopeJsonCodec),
}) satisfies Schema.Codec<IAggregateSessionSnapshot, any>;
