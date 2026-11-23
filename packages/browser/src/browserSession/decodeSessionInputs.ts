import { RoutePattern } from '@remix-run/route-pattern';
import type { IClaimsSchema } from '@zerospin/core/identity/types';
import * as Schema from 'effect/Schema';

const ResourcesSchema = Schema.Record(
  Schema.String,
  Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
);

export function decodeStandaloneInputs(
  sessionDefinition: { claimsSchema: IClaimsSchema },
  input: unknown,
) {
  const decodedInputs = Schema.decodeUnknownSync(
    Schema.Struct({
      claims: Schema.toType(sessionDefinition.claimsSchema),
      resources: Schema.optional(ResourcesSchema),
      backupPath: Schema.declare(
        (value: unknown): value is RoutePattern =>
          value instanceof RoutePattern,
      ),
    }),
    { onExcessProperty: 'error' },
  )(input);
  return {
    ...decodedInputs,
    backupPath: RoutePattern.parse(decodedInputs.backupPath.source),
    claims: structuredClone(decodedInputs.claims),
    ...(decodedInputs.resources === undefined
      ? {}
      : { resources: structuredClone(decodedInputs.resources) }),
  };
}
