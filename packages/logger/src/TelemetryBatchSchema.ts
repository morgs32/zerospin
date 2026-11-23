import * as Schema from 'effect/Schema';

import {
  SpanIdSchema as SpanId,
  SpanLinkRecordSchema,
  TraceIdSchema as TraceId,
} from './TraceContextSchema.ts';
import type { ITelemetryBatch } from './types.ts';

const Span = Schema.Struct({
  spanId: SpanId,
  traceId: TraceId,
  parentSpanId: Schema.NullOr(SpanId),
  name: Schema.String,
  status: Schema.Literals(['ok', 'error', 'lost']),
  startedAt: Schema.Number,
  endedAt: Schema.Number,
  attributes: Schema.NullOr(Schema.Record(Schema.String, Schema.Json)),
});
const Log = Schema.Struct({
  logId: Schema.String.check(Schema.isPattern(/^lgr_/)),
  createdAt: Schema.Number,
  level: Schema.Literals(['debug', 'info', 'warn', 'error']),
  message: Schema.String,
  source: Schema.String,
  payload: Schema.NullOr(Schema.Json),
  traceId: Schema.NullOr(TraceId),
  spanId: Schema.NullOr(SpanId),
});
const Batch = Schema.Struct({
  spans: Schema.Array(Span),
  logs: Schema.Array(Log),
  links: Schema.Array(SpanLinkRecordSchema),
});

export const TelemetryBatchSchema = Schema.declare(
  (value: unknown): value is ITelemetryBatch => Schema.is(Batch)(value),
);
