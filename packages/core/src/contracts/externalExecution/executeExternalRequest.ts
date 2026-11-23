import * as Effect from 'effect/Effect';

import { runAuthoredCallback } from '../../execution/runAuthoredCallback.ts';
import type { IExternalContractDefinition } from '../externalContract.ts';

import { encodeExternalResponse } from './encodeExternalResponse.ts';

/** Execute the authored request within its timeout and encode a usable response. */
export const executeExternalRequest = Effect.fn('executeExternalRequest')(
  function* (props: {
    external: IExternalContractDefinition;
    payload: unknown;
  }) {
    const { external, payload } = props;
    const response = yield* runAuthoredCallback({
      program: Effect.suspend(() => external.request({ payload })),
      code: 'external-request-failed',
    }).pipe(
      // Timeout interrupts and awaits request finalizers before outcome recording.
      Effect.timeout(external.timeoutMs),
    );
    return yield* encodeExternalResponse(external.response, response);
  },
);
