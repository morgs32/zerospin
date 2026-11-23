import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

const SamplingRateSchema = Schema.Number.check(
  Schema.isFinite(),
  Schema.isBetween({ minimum: 0, maximum: 1 }),
);
const HttpUrlSchema = Schema.String.check(
  Schema.makeFilter(value => {
    try {
      const url = new URL(value);
      return (
        ((url.protocol === 'https:' || url.protocol === 'http:') &&
          url.username === '' &&
          url.password === '') ||
        'Telemetry URLs must use HTTP(S) without userinfo'
      );
    } catch {
      return 'Telemetry URLs must be valid HTTP(S) URLs';
    }
  }),
);
const HeaderNameSchema = Schema.String.check(
  Schema.isPattern(/^[!#$%&'*+.^_`|~0-9a-z-]+$/iu),
);
const BindingNameSchema = Schema.String.check(
  Schema.isPattern(/^[a-z_][a-z0-9_]*$/iu),
);
const NativeSignalFields = {
  samplingRate: SamplingRateSchema,
  persist: Schema.Boolean,
  destinations: Schema.optional(
    Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  ),
};

export const TelemetryConfigSchema = Schema.Struct({
  otlp: Schema.optional(
    Schema.Struct({
      tracesEndpoint: HttpUrlSchema,
      logsEndpoint: HttpUrlSchema,
      samplingRate: SamplingRateSchema,
      headers: Schema.optional(Schema.Record(HeaderNameSchema, Schema.String)),
      secretHeaders: Schema.optional(
        Schema.Record(HeaderNameSchema, BindingNameSchema),
      ),
    }).check(
      Schema.makeFilter(({ headers, secretHeaders }) => {
        const names = new Set<string>();
        let duplicate = false;
        const validateName = (_value: string, name: string) => {
          const normalized = name.toLowerCase();
          if (names.has(normalized)) duplicate = true;
          names.add(normalized);
        };
        mapValues(headers ?? {}, validateName);
        mapValues(secretHeaders ?? {}, validateName);
        return !duplicate || 'Telemetry header names must be unique';
      }),
    ),
  ),
  cloudflare: Schema.optional(
    Schema.Struct({
      logs: Schema.optional(
        Schema.Struct({
          ...NativeSignalFields,
          invocationLogs: Schema.Boolean,
        }),
      ),
      traces: Schema.optional(Schema.Struct(NativeSignalFields)),
    }),
  ),
});

export type ITelemetryConfig = typeof TelemetryConfigSchema.Type;
