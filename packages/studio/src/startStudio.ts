import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { openStudioServer } from './server/openStudioServer.js';

/** Start Studio within its caller-owned cancellation lifetime and return explicit disposal. */
export const startStudio = makeFn('startStudio')(function* (props: {
  projectRoot: string;
  port: number;
  open: boolean;
  publicUrl?: string;
  systemSpec: ISystemSpec;
  signal: AbortSignal;
}) {
  return yield* Effect.tryPromise({
    try: () => openStudioServer(props),
    catch: failure =>
      makeZerospinError({
        code: 'studio-start-failed',
        message: 'Could not start Zerospin Studio.',
        cause: String(failure),
      }),
  });
});
