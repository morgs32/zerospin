import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { AggregateAgentReleaseSchema } from '../../../../agent/AggregateAgentReleaseSchema.ts';
import { ServiceAgentReleaseSchema } from '../../../../agent/ServiceAgentReleaseSchema.ts';
import { AggregateReleaseSchema } from '../../../../aggregate/make/makeAggregateRelease.ts';
import { VersionSchema } from '../../../../declaration/VersionSchema.ts';
import { ServiceReleaseSchema } from '../../../../service/make/makeServiceRelease.ts';
import type { ISystem } from '../../../types.ts';

const SystemPropsSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  aggregateAgents: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Record(
        Schema.String,
        Schema.Struct({
          releases: Schema.Record(Schema.String, AggregateAgentReleaseSchema),
          active: VersionSchema,
        }),
      ),
    ),
  ),
  serviceAgents: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Record(
        Schema.String,
        Schema.Struct({
          releases: Schema.Record(Schema.String, ServiceAgentReleaseSchema),
          active: VersionSchema,
        }),
      ),
    ),
  ),
  aggregates: Schema.Record(
    Schema.String,
    Schema.Struct({
      releases: Schema.Record(Schema.String, AggregateReleaseSchema),
    }),
  ),
  services: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        releases: Schema.Record(Schema.String, ServiceReleaseSchema),
      }),
    ),
  ),
});

export function decodeSystemProps(props: unknown): ISystem {
  const decodedProps = Schema.decodeUnknownSync(SystemPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  return {
    name: decodedProps.name,
    aggregateAgents: mapValues(decodedProps.aggregateAgents ?? {}, nodes => ({
      ...nodes,
    })),
    serviceAgents: mapValues(decodedProps.serviceAgents ?? {}, nodes => ({
      ...nodes,
    })),
    aggregates: mapValues(decodedProps.aggregates, versions => ({
      ...versions,
      releases: { ...versions.releases },
    })),
    services: mapValues(decodedProps.services ?? {}, versions => ({
      ...versions,
      releases: { ...versions.releases },
    })),
  };
}
