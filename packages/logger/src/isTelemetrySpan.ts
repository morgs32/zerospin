import * as Schema from 'effect/Schema';
import type * as Tracer from 'effect/Tracer';

import { SpanIdSchema, TraceIdSchema } from './TraceContextSchema.ts';
import type { ISpanId, ITraceId } from './types.ts';

/** Native Effect span IDs cannot be carried as Zerospin wire ancestry. */
export const isTelemetrySpan = (
  span: Tracer.AnySpan,
): span is Tracer.AnySpan & { traceId: ITraceId; spanId: ISpanId } =>
  Schema.is(TraceIdSchema)(span.traceId) &&
  Schema.is(SpanIdSchema)(span.spanId);
