import { getBackendTrace, ZerospinErrorJsonSchema } from '@zerospin/error';
import { encodeRpcExit, type ITelemetryCapture } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { makeRpcTraceLink } from '../makeRpcApi/makeRpcTraceLink.js';
import type { WorkerTelemetry } from '../WorkerTelemetry/WorkerTelemetry.js';

/** Export the source-owned records before encoding the original complete Exit. */
export function reportRpcTelemetry<A, E>(props: {
  capture: ITelemetryCapture<A, E>;
  methodName?: string;
  request?: unknown;
  emit?: WorkerTelemetry['Service']['emit'];
}) {
  return Effect.gen(function* () {
    const { capture, methodName, request, emit } = props;
    const root = capture.ownTelemetry.spans.findLast(
      span =>
        span.parentSpanId === null &&
        (methodName === undefined || span.name === methodName),
    );
    const link =
      methodName === undefined
        ? null
        : makeRpcTraceLink({ root, methodName, request });
    const batch =
      link === null
        ? capture.ownTelemetry
        : {
            ...capture.ownTelemetry,
            links: [...capture.ownTelemetry.links, link],
          };
    const backendTrace =
      emit === undefined
        ? null
        : yield* Effect.suspend(() =>
            emit({ batch, ...(root === undefined ? {} : { root }) }),
          ).pipe(Effect.catchCause(() => Effect.succeed(null)));
    const envelope = yield* encodeRpcExit(capture.exit, capture.telemetry);
    const result = envelope.result;
    if (
      backendTrace === null ||
      result._tag === 'Success' ||
      !Schema.is(ZerospinErrorJsonSchema)(result.failure) ||
      'scope' in result.failure ||
      getBackendTrace(result.failure) !== null
    ) {
      return { envelope, link };
    }
    return {
      envelope: {
        ...envelope,
        result: {
          ...result,
          failure: {
            ...result.failure,
            extra: { ...result.failure.extra, backendTrace },
          },
        },
      },
      link,
    };
  });
}
