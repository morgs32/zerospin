import * as Schema from 'effect/Schema';

import type { IMockBrowserSessionDefinition } from './types.ts';

/** Capture decoded identity and seed rows without acquiring session resources. */
export function captureMockInputs(
  sessionDefinition: IMockBrowserSessionDefinition,
  input: unknown,
) {
  const decodedInputs = Schema.decodeUnknownSync(
    Schema.Struct({
      claims: Schema.toType(sessionDefinition.claimsSchema),
      resources: Schema.optional(
        Schema.Record(
          Schema.String,
          Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
        ),
      ),
    }),
    { onExcessProperty: 'error' },
  )(input);
  return structuredClone(decodedInputs);
}
