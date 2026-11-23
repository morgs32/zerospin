import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

export const ServiceConnectionCapabilitiesSchema = Schema.Struct({
  contractVersions: Schema.Record(Schema.NonEmptyString, VersionSchema),
  modelNames: Schema.Array(Schema.NonEmptyString),
});

export type IServiceConnectionCapabilities =
  typeof ServiceConnectionCapabilitiesSchema.Type;

/** Retain selected models and exact contract versions after full admission-lock validation. */
export function makeConnectionCapabilities(
  lock: IServiceSessionLock,
): IServiceConnectionCapabilities {
  return {
    contractVersions: mapValues(lock.contracts, contract => contract.version),
    modelNames: Object.keys(lock.models),
  };
}
