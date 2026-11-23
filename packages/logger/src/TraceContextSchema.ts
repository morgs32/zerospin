import * as Schema from 'effect/Schema';

export const TraceIdSchema = Schema.TemplateLiteral([
  'trc_',
  Schema.String,
]).check(
  Schema.isPattern(/^trc_(?!0{32}$)[0-9a-f]{32}$/),
  Schema.isMaxLength(36),
);
export const SpanIdSchema = Schema.TemplateLiteral([
  'spn_',
  Schema.String,
]).check(
  Schema.isPattern(/^spn_(?!0{16}$)[0-9a-f]{16}$/),
  Schema.isMaxLength(20),
);
export const SpanLinkKindSchema = Schema.Literals(['causedBy', 'retryOf']);
export const TraceContextSchema = Schema.Struct({
  traceId: TraceIdSchema,
  parentSpanId: SpanIdSchema,
});
export const SpanLinkRecordSchema = Schema.Struct({
  linkId: Schema.TemplateLiteral(['lnk_', Schema.String]),
  traceId: TraceIdSchema,
  spanId: SpanIdSchema,
  priorTraceId: TraceIdSchema,
  priorSpanId: SpanIdSchema,
  kind: SpanLinkKindSchema,
});
