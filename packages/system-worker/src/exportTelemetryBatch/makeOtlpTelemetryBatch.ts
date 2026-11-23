import {
  SpanIdSchema,
  TraceIdSchema,
  type ITelemetryBatch,
} from '@zerospin/logger';
import type {
  OtlpLogger,
  OtlpResource,
  OtlpTracer,
} from 'effect/observability';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

/** OTLP uses the exact nonzero hexadecimal body of each local identifier. */
export const toOtlpTraceId = (traceId: string): string => {
  if (!Schema.is(TraceIdSchema)(traceId)) {
    throw new TypeError('Invalid application trace identifier');
  }
  return traceId.slice(4);
};

export const toOtlpSpanId = (spanId: string): string => {
  if (!Schema.is(SpanIdSchema)(spanId)) {
    throw new TypeError('Invalid application span identifier');
  }
  return spanId.slice(4);
};

const millisToNanos = (millis: number): string => {
  if (!Number.isFinite(millis) || millis < 0) {
    throw new TypeError('Invalid telemetry timestamp');
  }
  const wholeMillis = Math.trunc(millis);
  return (
    BigInt(wholeMillis) * 1_000_000n +
    BigInt(Math.round((millis - wholeMillis) * 1_000_000))
  ).toString();
};

const jsonAttributes = (
  record: Readonly<Record<string, Schema.Json>>,
): OtlpResource.KeyValue[] =>
  Object.values(
    mapValues(record, (value, key) => ({ key, value: jsonValue(value) })),
  );

/** Keep JSON objects structured rather than formatting them as opaque strings. */
const jsonValue = (value: Schema.Json): OtlpResource.AnyValue => {
  if (value === null) return {};
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') {
    return Number.isSafeInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  if (Schema.is(Schema.Array(Schema.Json))(value)) {
    return { arrayValue: { values: value.map(jsonValue) } };
  }
  return { kvlistValue: { values: jsonAttributes(value) } };
};

/** Convert completed source-owned records without allocating application spans. */
export const makeOtlpTelemetryBatch = (
  batch: ITelemetryBatch,
  resource: OtlpResource.Resource,
): { traces: OtlpTracer.TraceData; logs: OtlpLogger.LogsData } => {
  const linksBySpan = new Map<
    string,
    OtlpTracer.ScopeSpan['spans'][number]['links']
  >();
  for (const link of batch.links) {
    const traceId = toOtlpTraceId(link.traceId);
    const spanId = toOtlpSpanId(link.spanId);
    const key = `${traceId}/${spanId}`;
    const links = linksBySpan.get(key) ?? [];
    links.push({
      traceId: toOtlpTraceId(link.priorTraceId),
      spanId: toOtlpSpanId(link.priorSpanId),
      attributes: [
        { key: 'zerospin.link.kind', value: { stringValue: link.kind } },
        { key: 'zerospin.link.id', value: { stringValue: link.linkId } },
      ],
      droppedAttributesCount: 0,
    });
    linksBySpan.set(key, links);
  }

  const spans: OtlpTracer.ScopeSpan['spans'] = batch.spans.map(span => {
    const traceId = toOtlpTraceId(span.traceId);
    const spanId = toOtlpSpanId(span.spanId);
    return {
      traceId,
      spanId,
      parentSpanId:
        span.parentSpanId === null
          ? undefined
          : toOtlpSpanId(span.parentSpanId),
      name: span.name,
      kind: 1,
      startTimeUnixNano: millisToNanos(span.startedAt),
      endTimeUnixNano: millisToNanos(span.endedAt),
      attributes:
        span.attributes === null ? [] : jsonAttributes(span.attributes),
      droppedAttributesCount: 0,
      events: [],
      droppedEventsCount: 0,
      status: {
        code: span.status === 'ok' ? 1 : span.status === 'error' ? 2 : 0,
      },
      links: linksBySpan.get(`${traceId}/${spanId}`) ?? [],
      droppedLinksCount: 0,
    };
  });

  const severities = { debug: 5, info: 9, warn: 13, error: 17 } as const;
  const logs: OtlpLogger.LogsData = {
    resourceLogs: [
      {
        resource,
        scopeLogs: [
          {
            scope: { name: '@zerospin/logger' },
            logRecords: batch.logs.map(log => ({
              timeUnixNano: millisToNanos(log.createdAt),
              observedTimeUnixNano: millisToNanos(log.createdAt),
              severityNumber: severities[log.level],
              severityText: log.level,
              body: { stringValue: log.message },
              attributes: [
                { key: 'zerospin.log.id', value: { stringValue: log.logId } },
                {
                  key: 'zerospin.log.source',
                  value: { stringValue: log.source },
                },
                ...(log.payload === null
                  ? []
                  : [
                      {
                        key: 'zerospin.log.payload',
                        value: jsonValue(log.payload),
                      },
                    ]),
              ],
              ...(log.traceId === null
                ? {}
                : { traceId: toOtlpTraceId(log.traceId) }),
              ...(log.spanId === null
                ? {}
                : { spanId: toOtlpSpanId(log.spanId) }),
              droppedAttributesCount: 0,
            })),
          },
        ],
      },
    ],
  };

  return {
    traces: {
      resourceSpans: [
        {
          resource,
          scopeSpans: [{ scope: { name: '@zerospin/logger' }, spans }],
        },
      ],
    },
    logs,
  };
};
