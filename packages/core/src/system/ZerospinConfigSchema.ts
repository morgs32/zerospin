import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Exit from 'effect/Exit';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';

import { AggregateAgentReleaseSchema } from '../agent/AggregateAgentReleaseSchema.ts';
import { ServiceAgentReleaseSchema } from '../agent/ServiceAgentReleaseSchema.ts';
import { AggregateReleaseSchema } from '../aggregate/make/makeAggregateRelease.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';
import { ServiceReleaseSchema } from '../service/make/makeServiceRelease.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import { TelemetryConfigSchema } from './TelemetryConfigSchema.ts';
import type {
  IAggregateRegistryEntry,
  ISystem,
  ISystemConfig,
} from './types.ts';

const decodeAggregateRegistryEntry = Schema.decodeUnknownExit(
  Schema.Struct({
    releases: Schema.Record(Schema.String, AggregateReleaseSchema).check(
      Schema.isMinProperties(1),
    ),
  }),
  { onExcessProperty: 'error' },
);
const AggregateRegistryEntrySchema = Schema.declare<IAggregateRegistryEntry>(
  (value): value is IAggregateRegistryEntry =>
    Exit.isSuccess(decodeAggregateRegistryEntry(value)),
);

/** Validate live configuration capabilities without copying or executing them. */
export const ZerospinConfigSchema = Schema.declare<ISystemConfig>(
  (input): input is ISystemConfig => {
    const decoded = Schema.decodeUnknownExit(
      Schema.Struct({
        systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
        managedRuntime: Schema.declare(ManagedRuntime.isManagedRuntime),
        telemetry: Schema.optional(TelemetryConfigSchema),
        wrangler: Schema.optional(Schema.JsonObject),
        system: Schema.declare<ISystem>((value): value is ISystem =>
          Schema.is(
            Schema.Struct({
              name: Schema.String,
              aggregateAgents: Schema.Record(
                Schema.String,
                Schema.Record(
                  Schema.String,
                  Schema.Struct({
                    releases: Schema.Record(
                      Schema.String,
                      AggregateAgentReleaseSchema,
                    ),
                    active: VersionSchema,
                  }),
                ),
              ),
              serviceAgents: Schema.Record(
                Schema.String,
                Schema.Record(
                  Schema.String,
                  Schema.Struct({
                    releases: Schema.Record(
                      Schema.String,
                      ServiceAgentReleaseSchema,
                    ),
                    active: VersionSchema,
                  }),
                ),
              ),
              aggregates: Schema.Record(
                Schema.String,
                AggregateRegistryEntrySchema,
              ),
              services: Schema.Record(
                Schema.String,
                Schema.Struct({
                  releases: Schema.Record(Schema.String, ServiceReleaseSchema),
                }),
              ),
            }),
          )(value),
        ),
      }),
    )(input, { onExcessProperty: 'error' });
    if (Exit.isFailure(decoded)) {
      return false;
    }
    return true;
  },
);
