import type { IClaimsSchema } from '@zerospin/core/identity/types';
import { mapParseError, type IAnyError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** Acquire fresh credentials for each server admission. */
export function makeCredentialsAdmissionProvider(props: {
  claimsSchema: IClaimsSchema;
  credentialsSchema: Schema.Codec<unknown, unknown>;
  initialization: unknown;
}): {
  claims: Readonly<Record<string, unknown>> | undefined;
  getAdmission(): Effect.Effect<{ credentials: unknown }, IAnyError>;
} {
  const { claimsSchema, initialization, credentialsSchema } = props;

  const decodedInitialization = Schema.decodeUnknownSync(
    Schema.Struct({
      expectedClaims: Schema.optional(Schema.toType(claimsSchema)),
      getCredentials: Schema.declare(
        (value: unknown): value is () => Effect.Effect<unknown, IAnyError> =>
          typeof value === 'function',
      ),
    }),
    { onExcessProperty: 'error' },
  )(initialization);
  return {
    claims:
      decodedInitialization.expectedClaims === undefined
        ? undefined
        : structuredClone(decodedInitialization.expectedClaims),
    getAdmission: () =>
      Effect.suspend(decodedInitialization.getCredentials).pipe(
        Effect.flatMap(credentials =>
          Schema.decodeUnknownEffect(Schema.toType(credentialsSchema), {
            onExcessProperty: 'error',
          })(credentials).pipe(
            mapParseError({
              code: 'session-credentials-invalid',
              prefix: 'Invalid session credentials',
            }),
          ),
        ),
        Effect.map(credentials => ({ credentials })),
      ),
  };
}
