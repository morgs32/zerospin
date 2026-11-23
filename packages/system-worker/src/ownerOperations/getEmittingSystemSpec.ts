import type { IOwnerRelease } from '@zerospin/core/system/ownerReleaseDeployment';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import { getSystemSpec } from '../getSystemSpec/getSystemSpec.js';
import {
  getPinnedOwnerRelease,
  readExecutingSystemSpec,
} from '../workerConfiguration/workerConfiguration.js';
import '../SystemRepo/registerRepo/systemRepoNamespaces.js';

/** Settle retained work using the executable's accepted declarations after retirement. */
export const getEmittingSystemSpec = Effect.fn('getEmittingSystemSpec')(
  function* (release: IOwnerRelease) {
    if ('serviceName' in release && env.ZEROSPIN_HOSTED_SERVICE_DISPATCH) {
      return yield* getSystemSpec(env.ZEROSPIN_SYSTEM_ID, release);
    }
    const spec = readExecutingSystemSpec();
    const declared =
      'aggregateName' in release
        ? spec.aggregates[release.aggregateName]?.releases[
            release.aggregateVersion
          ]
        : spec.services[release.serviceName]?.releases[release.serviceVersion];
    if (declared !== undefined) return spec;

    const pin = getPinnedOwnerRelease(release);
    if (pin !== undefined) {
      const systemRepo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
      const retained = yield* Effect.promise(() =>
        systemRepo.getAcceptedSystemSpec(pin.specHash),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      if (retained !== null) return retained;
    }
    return yield* makeZerospinError('owner-operation-definition-unavailable');
  },
);
