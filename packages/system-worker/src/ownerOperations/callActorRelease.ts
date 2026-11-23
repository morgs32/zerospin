import {
  getOwnerReleaseBindingName,
  type IOwnerRelease,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { System } from '@zerospin/core/system/System';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  ensureZerospinError,
  makeZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import { readAuthoredWorkerConfig } from '../workerConfiguration/workerConfiguration.js';

import type { IOwnerReleaseWorkerBinding } from './ownerReleaseWorkerBindings.js';

/** Use the exact release binding, or the native runtime when dev co-locates the release. */
export const callActorRelease = Effect.fn('callActorRelease')(function* <
  A,
  E,
  R,
>(props: {
  release: IOwnerRelease;
  local: Effect.Effect<A, E, R>;
  remote(
    worker: IOwnerReleaseWorkerBinding,
    systemId: string,
  ): Promise<IRpcEnvelope<A, IZerospinErrorJson>>;
}) {
  const { release, local, remote } = props;
  const bindingName = getOwnerReleaseBindingName(release);
  const worker = env[bindingName];
  if (worker !== undefined) {
    const envelope = yield* Effect.tryPromise({
      try: () => remote(worker, env.ZEROSPIN_SYSTEM_ID),
      catch: error =>
        ensureZerospinError({ code: 'actor-release-unavailable', error }),
    });
    return yield* readRpcEnvelope(envelope);
  }

  const authored = readAuthoredWorkerConfig();
  const namespace =
    'aggregateName' in release
      ? env.AGGREGATE_VERSION_REPO
      : env.SERVICE_VERSION_REPO;
  if (authored === undefined || namespace === undefined) {
    return yield* makeZerospinError('actor-release-unavailable');
  }
  return yield* local.pipe(Effect.provideService(System, authored.system));
});
