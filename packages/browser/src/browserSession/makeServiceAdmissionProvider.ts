import type {
  IAdmissionRequest,
  IClaimsSchema,
} from '@zerospin/core/identity/types';
import type { IAnyError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { makeCredentialsAdmissionProvider } from './makeCredentialsAdmissionProvider.ts';

/** Capture direct claims once; acquire fresh credentials for each server admission. */
export function makeServiceAdmissionProvider(props: {
  claimsSchema: IClaimsSchema;
  credentialsSchema?: Schema.Codec<unknown, unknown> | undefined;
  initialization: unknown;
}): {
  claims: Readonly<Record<string, unknown>> | undefined;
  getAdmission(): Effect.Effect<IAdmissionRequest, IAnyError>;
} {
  const { credentialsSchema, claimsSchema, initialization } = props;
  if (credentialsSchema === undefined) {
    const decodedInitialization = Schema.decodeUnknownSync(
      Schema.Struct({ claims: Schema.Unknown }),
      { onExcessProperty: 'error' },
    )(initialization);
    const claims = structuredClone(
      Schema.decodeUnknownSync(Schema.toType(claimsSchema), {
        onExcessProperty: 'error',
      })(decodedInitialization.claims),
    );
    return { claims, getAdmission: () => Effect.succeed({ claims }) };
  }
  return makeCredentialsAdmissionProvider({
    claimsSchema,
    initialization,
    credentialsSchema,
  });
}
