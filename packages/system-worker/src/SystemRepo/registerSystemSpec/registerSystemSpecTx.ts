import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { hashSystemSpec } from '@zerospin/core/system/hashSystemSpec';
import {
  getOwnerReleaseBindingName,
  type IOwnerReleaseIdentity,
} from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { isEqual } from 'es-toolkit';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

import { checkSystemSpecCompatibility } from './checkSystemSpecCompatibility.js';

/** Compare all immutable facts before retaining one complete accepted SystemSpec. */
export const registerSystemSpecTx = makeTx('SystemRepo.registerSystemSpecTx')(
  function* (
    tx: ITx<typeof systemRepoDbConfig>,
    {
      spec,
      ownerReleases,
    }: {
      spec: ISystemSpec;
      ownerReleases: readonly IOwnerReleaseIdentity[];
    },
  ) {
    const table = systemRepoDbConfig.schema.acceptedSystemSpecs;
    const retained: ISystemSpec[] = [];
    const acceptedPins = new Map<string, IOwnerReleaseIdentity>();
    let alreadyAccepted = false;
    for (const row of tx.select().from(table).all()) {
      const snapshot = yield* systemRepoDbConfig.tables.acceptedSystemSpecs
        .decodeRow(row)
        .pipe(
          mapParseError({
            code: 'system-spec-invalid',
            prefix: 'Stored SystemSpec is invalid',
          }),
        );
      if (
        snapshot.hash !== snapshot.spec.hash ||
        hashSystemSpec(snapshot.spec) !== snapshot.hash
      ) {
        return yield* makeZerospinError({
          code: 'system-spec-invalid',
          message: 'Stored SystemSpec hash does not match its content',
        });
      }
      for (const pin of snapshot.ownerReleases) {
        acceptedPins.set(getOwnerReleaseBindingName(pin.release), pin);
      }
      alreadyAccepted ||= snapshot.hash === spec.hash;
      retained.push(snapshot.spec);
    }
    const incomingPins = new Set<string>();
    for (const pin of ownerReleases) {
      const bindingName = getOwnerReleaseBindingName(pin.release);
      const accepted = acceptedPins.get(bindingName);
      const release = pin.release;
      const declared =
        'aggregateName' in release
          ? spec.aggregates[release.aggregateName]?.releases[
              release.aggregateVersion
            ]
          : spec.services[release.serviceName]?.releases[
              release.serviceVersion
            ];
      if (
        incomingPins.has(bindingName) ||
        (accepted === undefined
          ? alreadyAccepted ||
            pin.specHash !== spec.hash ||
            declared === undefined
          : !isEqual(accepted, pin))
      ) {
        return yield* makeZerospinError({
          code: 'zerospin-owner-release-pin-conflict',
          message:
            'Cannot accept owner Worker version ' +
            pin.versionId +
            ' for ' +
            JSON.stringify(pin.release) +
            (accepted
              ? '. Accepted version is ' + accepted.versionId + '.'
              : '.'),
        });
      }
      incomingPins.add(bindingName);
    }
    if (alreadyAccepted) return;
    yield* checkSystemSpecCompatibility(spec, retained);
    const row = yield* systemRepoDbConfig.tables.acceptedSystemSpecs
      .encodeRow({
        hash: spec.hash,
        spec,
        ownerReleases,
      })
      .pipe(
        mapParseError({
          code: 'system-spec-invalid',
          prefix: 'SystemSpec cannot be stored',
        }),
      );
    tx.insert(table).values(row).run();
  },
);
