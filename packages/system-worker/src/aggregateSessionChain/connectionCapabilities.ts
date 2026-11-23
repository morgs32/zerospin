import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

export const AggregateConnectionCapabilitiesSchema = Schema.Struct({
  modelNames: Schema.Array(Schema.String),
  contractVersions: Schema.Record(Schema.String, VersionSchema),
});

export type IAggregateConnectionCapabilities = Schema.Schema.Type<
  typeof AggregateConnectionCapabilitiesSchema
>;

/** Retain only the model selection and exact command versions from validated admission. */
export function makeConnectionCapabilities(
  lock: IAggregateSessionLock,
): IAggregateConnectionCapabilities {
  return {
    modelNames: Object.keys(lock.models),
    contractVersions: mapValues(lock.contracts, contract => contract.version),
  };
}
