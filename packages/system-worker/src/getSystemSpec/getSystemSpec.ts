import type { ISystemSpec } from '@zerospin/core/system/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  ensureZerospinError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import { readExecutingSystemSpec } from '../workerConfiguration/workerConfiguration.js';

/** Hosted requests resolve accepted declarations from their Instance catalog. */
export const getSystemSpec = makeFn('SystemWorker.getSystemSpec', {
  root: true,
})((
  systemId?: string,
  release?: { serviceName: string; serviceVersion: number },
): Effect.Effect<ISystemSpec, IAnyError> => {
  if (systemId !== undefined && env.ZEROSPIN_HOSTED_SERVICE_DISPATCH) {
    return Effect.tryPromise({
      try: () =>
        env.SYSTEM_REPO.getByName(systemId).getAcceptedSystemSpec(release),
      catch: error =>
        ensureZerospinError({
          code: 'zerospin-deployment-system-repo-unavailable',
          error,
          message: 'The Instance catalog lookup failed.',
        }),
    }).pipe(
      Effect.flatMap(readRpcEnvelope),
      Effect.mapError(error =>
        ensureZerospinError({
          code: error.code,
          message: error.message,
          error,
        }),
      ),
      Effect.flatMap(spec =>
        spec === null
          ? Effect.fail(
              makeZerospinError({
                code: 'system-spec-not-accepted',
                message: release
                  ? `The Instance has no registered SystemSpec for ${release.serviceName}@${release.serviceVersion}.`
                  : 'The Instance has no registered SystemSpec.',
              }),
            )
          : Effect.succeed(spec),
      ),
    );
  }
  return Effect.try({
    try: readExecutingSystemSpec,
    catch: () =>
      makeZerospinError({
        code: 'system-runtime-system-spec-invalid',
        message: 'This Worker version has no valid SystemSpec.',
      }),
  });
});
