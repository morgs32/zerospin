import * as Schema from 'effect/Schema';

import { ReleaseSpecSchema } from '../declaration/ReleaseSpecSchemas.ts';
import { VersionSchema } from '../declaration/VersionSchema.ts';
import { sha256 } from '../utils/sha256.ts';

export const OWNER_RELEASE_BINDING_PREFIX = 'ZEROSPIN_RELEASE_';
export const VERIFY_OWNER_RELEASE_BINDING_PATH =
  '/__zerospin/verify-owner-release-binding';
export const PREPARE_AGGREGATE_REPLAY_PATH =
  '/__zerospin/prepare-aggregate-replay';
export const PREPARE_SERVICE_REPLAY_PATH = '/__zerospin/prepare-service-replay';

export const RUN_OWNER_OPERATION_PATH = '/__zerospin/run-owner-operation';

export const OwnerReleaseSchema = Schema.Union([
  Schema.Struct({
    aggregateName: Schema.NonEmptyString,
    aggregateVersion: VersionSchema,
  }),
  Schema.Struct({
    serviceName: Schema.NonEmptyString,
    serviceVersion: VersionSchema,
  }),
]);

export type IOwnerRelease = typeof OwnerReleaseSchema.Type;

export const OwnerReleaseIdentitySchema = Schema.Struct({
  systemId: Schema.NonEmptyString,
  release: OwnerReleaseSchema,
  versionId: Schema.NonEmptyString,
  specHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
});

export type IOwnerReleaseIdentity = typeof OwnerReleaseIdentitySchema.Type;

export const OwnerReleaseDeclarationSchema = Schema.Struct({
  identity: OwnerReleaseIdentitySchema,
  releaseSpec: ReleaseSpecSchema,
  deploymentId: Schema.optionalKey(Schema.NonEmptyString),
});

function ownerReleaseKey(release: IOwnerRelease): string {
  return JSON.stringify(
    'aggregateName' in release
      ? ['aggregate', release.aggregateName, release.aggregateVersion]
      : ['service', release.serviceName, release.serviceVersion],
  );
}

export function getOwnerReleaseBindingName(release: IOwnerRelease) {
  return `${OWNER_RELEASE_BINDING_PREFIX}${sha256(ownerReleaseKey(release)).toUpperCase()}` as const;
}

export function getOwnerReleaseWorkerName(
  stableWorkerName: string,
  release: IOwnerRelease,
): string {
  const digest = sha256(
    JSON.stringify([stableWorkerName, ownerReleaseKey(release)]),
  );
  const suffix = '-release-' + digest.slice(0, 24);
  return stableWorkerName.slice(0, 63 - suffix.length) + suffix;
}
