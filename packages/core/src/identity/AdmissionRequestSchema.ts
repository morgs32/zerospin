import * as Schema from 'effect/Schema';
export const AdmissionRequestSchema = Schema.Union([
  Schema.Struct({ claims: Schema.Unknown }),
  Schema.Struct({ credentials: Schema.Unknown }),
]);
