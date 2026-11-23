import { mapParseError } from '@zerospin/error';
import { decodeSync, encodeSync } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IExternalContractDefinition } from '../externalContract.ts';

/** Validate the application response, encode it with its declaration and require JSON. */
export const encodeExternalResponse = Effect.fn('encodeExternalResponse')(
  function* (
    responseSchema: IExternalContractDefinition['response'],
    response: unknown,
  ) {
    const decodedResponse = yield* decodeSync(
      Schema.toType(responseSchema),
      response,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'external-response-invalid',
        prefix: 'Invalid external response',
      }),
    );
    const encoded = yield* encodeSync(responseSchema, decodedResponse).pipe(
      mapParseError({
        code: 'external-response-encode-failed',
        prefix: 'Cannot encode external response',
      }),
    );
    return yield* decodeSync(Schema.Json, encoded).pipe(
      mapParseError({
        code: 'external-response-json-invalid',
        prefix: 'External response must encode as JSON',
      }),
    );
  },
);
