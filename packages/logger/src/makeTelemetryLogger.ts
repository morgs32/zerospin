import * as Cause from 'effect/Cause';
import { toStringUnknown } from 'effect/Inspectable';
import * as Logger from 'effect/Logger';
import * as References from 'effect/References';

import { isTelemetrySpan } from './isTelemetrySpan.ts';
import { makeLogId } from './makeTelemetryIds.ts';
import type { ITelemetryCollector } from './TelemetryCollector.ts';
import { telemetryValue } from './telemetryValue.ts';
import type { ILogLevel } from './types.ts';

export const makeTelemetryLogger = (
  collector: ITelemetryCollector,
): Logger.Logger<unknown, void> =>
  Logger.make(options => {
    const span = options.fiber.cache.span ?? null;
    const telemetrySpan = span !== null && isTelemetrySpan(span) ? span : null;

    const payload: Record<string, unknown> = {
      ...options.fiber.getRef(References.CurrentLogAnnotations),
    };
    const logSpans = options.fiber.getRef(References.CurrentLogSpans);
    if (logSpans.length > 0) {
      payload['effect.logSpans'] = logSpans.map(([name, startedAt]) => ({
        name,
        elapsedMs: options.date.getTime() - startedAt,
      }));
    }
    if (options.cause.reasons.length > 0) {
      payload['cause'] = Cause.pretty(options.cause);
    }

    let level: ILogLevel;
    switch (options.logLevel.toUpperCase()) {
      case 'FATAL':
      case 'ERROR':
        level = 'error';
        break;
      case 'WARN':
        level = 'warn';
        break;
      case 'DEBUG':
      case 'TRACE':
      case 'ALL':
        level = 'debug';
        break;
      default:
        level = 'info';
    }

    collector.addLog({
      logId: makeLogId(),
      createdAt: options.date.getTime(),
      level,
      message: Array.isArray(options.message)
        ? options.message.map(part => toStringUnknown(part)).join(' ')
        : toStringUnknown(options.message),
      source: span !== null && span._tag === 'Span' ? span.name : 'effect',
      payload: Object.keys(payload).length > 0 ? telemetryValue(payload) : null,
      traceId: telemetrySpan?.traceId ?? null,
      spanId: telemetrySpan?.spanId ?? null,
    });
  });
