import * as Schema from 'effect/Schema';

/** Provider correlation identifiers; this reference makes no delivery or retention claim. */
export const BackendTraceSchema = Schema.Struct({
  traceId: Schema.String.check(
    Schema.isPattern(/^(?!0{32}$)[0-9a-f]{32}$/),
    Schema.isMaxLength(32),
  ),
  spanId: Schema.String.check(
    Schema.isPattern(/^(?!0{16}$)[0-9a-f]{16}$/),
    Schema.isMaxLength(16),
  ),
});

export type IBackendTrace = typeof BackendTraceSchema.Type;
