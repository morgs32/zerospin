import { AggregateNodeRequestSchema } from '@zerospin/browser/AggregateNode/aggregateNodeRequest';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type { IAnyAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import * as Schema from 'effect/Schema';

export const AggregateNativeConfigurationSchema = Schema.Struct({
  apiUrl: Schema.String,
  publishableKey: Schema.String,
  aggregateId: Schema.String,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  credentials: Schema.Record(Schema.String, Schema.Unknown),
});
export type IAggregateNativeConfiguration =
  typeof AggregateNativeConfigurationSchema.Type;

/** Validate and retain one exact identity before acquiring either native file. */
export function decodeAggregateNativeSessionInputs(props: {
  sessionDefinition: IAnyAggregateSessionDefinition;
  configuration: IAggregateNativeConfiguration;
}) {
  const { sessionDefinition, configuration: inputConfiguration } = props;
  const configuration = Schema.decodeUnknownSync(
    AggregateNativeConfigurationSchema,
  )(structuredClone(inputConfiguration), { onExcessProperty: 'error' });
  const claims = Schema.decodeUnknownSync(sessionDefinition.claimsSchema)(
    configuration.claims,
  );
  const request = Schema.decodeUnknownSync(AggregateNodeRequestSchema)({
    apiUrl: configuration.apiUrl,
    publishableKey: configuration.publishableKey,
    systemName: sessionDefinition.systemName,
    aggregateName: sessionDefinition.aggregateName,
    aggregateVersion: sessionDefinition.aggregateVersion,
    sessionName: sessionDefinition.sessionName,
    lock: makeAggregateSessionSpec(sessionDefinition).aggregateSessionLock,
  });
  return { configuration, claims, request };
}
