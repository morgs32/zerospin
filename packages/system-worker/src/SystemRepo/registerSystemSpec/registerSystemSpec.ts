import type { IDb } from '@zerospin/core/drizzle/types';
import { hashSystemSpec } from '@zerospin/core/system/hashSystemSpec';
import {
  OwnerReleaseIdentitySchema,
  type IOwnerReleaseIdentity,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { systemRepoDbConfig } from '../systemRepoDbConfig.js';

import { registerSystemSpecTx } from './registerSystemSpecTx.js';

/** Verify the supplied candidate, then accept its complete snapshot atomically. */
export const registerSystemSpec = makeFn('SystemRepo.registerSystemSpec')(
  function* (props: {
    db: IDb<typeof systemRepoDbConfig>;
    systemId: string;
    spec: ISystemSpec;
    ownerReleases: readonly IOwnerReleaseIdentity[];
  }) {
    const { db, spec: incomingSpec } = props;
    const spec = yield* Schema.decodeUnknownEffect(SystemSpecSchema)(
      incomingSpec,
      {
        onExcessProperty: 'error',
      },
    ).pipe(
      mapParseError({
        code: 'system-spec-invalid',
        prefix: 'SystemRepo received an invalid SystemSpec',
      }),
    );
    const actualHash = yield* Effect.try({
      try: () => hashSystemSpec(spec),
      catch: () =>
        makeZerospinError({
          code: 'system-spec-invalid',
          message: 'SystemSpec contains non-JSON metadata',
        }),
    });
    if (actualHash !== spec.hash) {
      return yield* makeZerospinError({
        code: 'system-spec-hash-mismatch',
        message: 'The supplied SystemSpec hash does not match its content',
      });
    }
    const ownerReleases = yield* Schema.decodeUnknownEffect(
      Schema.Array(OwnerReleaseIdentitySchema),
    )(props.ownerReleases, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'zerospin-owner-release-pins-invalid',
        prefix: 'SystemRepo received invalid owner Worker pins',
      }),
    );
    if (ownerReleases.some(pin => pin.systemId !== props.systemId)) {
      return yield* makeZerospinError({
        code: 'zerospin-owner-release-pins-invalid',
        message: 'An owner Worker pin belongs to a different System.',
      });
    }
    yield* registerSystemSpecTx(db, { spec, ownerReleases });
  },
);
