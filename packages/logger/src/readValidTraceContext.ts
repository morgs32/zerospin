import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

import { TraceContextSchema } from './TraceContextSchema.ts';
import type { ITraceContext } from './types.ts';

/** Malformed/native span IDs are inert diagnostics, never invented wire ancestry. */
export function readValidTraceContext(input: unknown): ITraceContext | null {
  try {
    const context = Schema.decodeUnknownResult(TraceContextSchema)(input);
    return Result.isSuccess(context) ? context.success : null;
  } catch {
    return null;
  }
}

/** Project the current Effect span without assuming it uses Zerospin identifiers. */
export function readSpanTraceContext(span: {
  traceId: string;
  spanId: string;
}): ITraceContext | null {
  return readValidTraceContext({
    traceId: span.traceId,
    parentSpanId: span.spanId,
  });
}
