import type { IDb } from '@zerospin/core/drizzle/types';
import { hashSystemSpec } from '@zerospin/core/system/hashSystemSpec';
import {
  getOwnerReleaseBindingName,
  type IOwnerReleaseIdentity,
} from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

import { checkSystemSpecCompatibility } from './registerSystemSpec/checkSystemSpecCompatibility.js';
import { systemRepoDbConfig } from './systemRepoDbConfig.js';

export const SYSTEM_REPO_PREFLIGHT_PREFIX = 'SystemRepo catalog preflight: ';

/** Reject invalid or incompatible retained specs before changing storage. */
export const preflightAcceptedSystemSpec = Effect.fn(
  'SystemRepo.preflightAcceptedSystemSpec',
)(function* (props: {
  db: IDb<typeof systemRepoDbConfig>;
  candidate: () => ISystemSpec;
  hasVersionBoundAgentStorage: boolean;
}) {
  const { db, candidate } = props;
  const columns = db.all<{ name: string }>(
    sql`PRAGMA table_info(acceptedSystemSpecs)`,
  );
  if (columns.length === 0) return [];
  if (!columns.some(column => column.name === 'ownerReleases')) {
    return yield* makeZerospinError({
      code: 'system-spec-invalid',
      message:
        'The retained SystemSpec catalog predates exact owner Worker pins.',
    });
  }

  const retained: ISystemSpec[] = [];
  const acceptedPins = new Map<string, IOwnerReleaseIdentity>();
  for (const row of db
    .select()
    .from(systemRepoDbConfig.schema.acceptedSystemSpecs)
    .all()) {
    const snapshot = yield* systemRepoDbConfig.tables.acceptedSystemSpecs
      .decodeRow(row)
      .pipe(
        Effect.mapError(() =>
          makeZerospinError({
            code: 'system-spec-invalid',
            message: `Retained SystemSpec ${row.hash} cannot be read in the current format`,
          }),
        ),
      );
    if (
      snapshot.hash !== snapshot.spec.hash ||
      hashSystemSpec(snapshot.spec) !== snapshot.hash
    ) {
      return yield* makeZerospinError({
        code: 'system-spec-invalid',
        message: `Retained SystemSpec ${row.hash} hash does not match its content`,
      });
    }
    // A previously accepted Agent can still open an installation during rollout.
    if (
      !props.hasVersionBoundAgentStorage &&
      [
        ...Object.values(snapshot.spec.aggregates),
        ...Object.values(snapshot.spec.services),
      ].some(owner => Object.keys(owner.agentVersions).length > 0)
    ) {
      return yield* makeZerospinError({
        code: 'agent-wake-storage-incompatible',
        message:
          'This SystemRepo retains an Agent catalog with an incompatible installation format.',
      });
    }
    retained.push(snapshot.spec);
    for (const pin of snapshot.ownerReleases) {
      const bindingName = getOwnerReleaseBindingName(pin.release);
      const previous = acceptedPins.get(bindingName);
      if (previous !== undefined && !isEqual(previous, pin)) {
        return yield* makeZerospinError({
          code: 'system-spec-invalid',
          message:
            'Retained owner Worker pins disagree for ' +
            JSON.stringify(pin.release) +
            '.',
        });
      }
      acceptedPins.set(bindingName, pin);
    }
  }
  if (retained.length > 0) {
    yield* checkSystemSpecCompatibility(candidate(), retained);
  }
  return [...acceptedPins.values()];
});
