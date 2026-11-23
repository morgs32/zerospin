import {
  TelemetryConfigSchema,
  type ITelemetryConfig,
} from '@zerospin/core/system/TelemetryConfigSchema';
import type { IBackendTrace } from '@zerospin/error';
import type { ISpanRecord } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as OtlpResource from 'effect/observability/OtlpResource';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { exportTelemetryBatch } from '../exportTelemetryBatch/exportTelemetryBatch.js';
import {
  toOtlpSpanId,
  toOtlpTraceId,
} from '../exportTelemetryBatch/makeOtlpTelemetryBatch.js';
import { readAuthoredWorkerConfig } from '../workerConfiguration/workerConfiguration.js';
import { WorkerTelemetry } from '../WorkerTelemetry/WorkerTelemetry.js';

/** Runtime binding lookup is deliberately absent from portable config loading. */
const readDeliveryHeaders = (
  otlp: NonNullable<ITelemetryConfig['otlp']>,
): Record<string, string> => {
  const secretHeaders = mapValues(otlp.secretHeaders ?? {}, binding => {
    const value: unknown = Reflect.get(env, binding);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('Application telemetry credential unavailable');
    }
    return value;
  });
  return { ...otlp.headers, ...secretHeaders };
};

const sampleInvocation = (recordId: string, samplingRate: number): boolean =>
  Number.parseInt(recordId.slice(0, 13), 16) / 0x10000000000000 < samplingRate;

/** A reference names the actual root and makes no delivery/indexing promise. */
export const WorkerTelemetryLive = Layer.succeed(WorkerTelemetry, {
  emit: props => {
    const { batch, root: submittedRoot } = props;
    return Effect.suspend(() => {
      const configured = readAuthoredWorkerConfig();
      const telemetry =
        env.ZEROSPIN_TELEMETRY === undefined
          ? configured?.telemetry
          : Schema.decodeUnknownSync(TelemetryConfigSchema)(
              env.ZEROSPIN_TELEMETRY,
            );
      const otlp = telemetry?.otlp;
      if (otlp === undefined) return Effect.succeed(null);

      const root: ISpanRecord | undefined =
        submittedRoot == null
          ? undefined
          : batch.spans.find(
              span =>
                span.traceId === submittedRoot?.traceId &&
                span.spanId === submittedRoot?.spanId,
            );
      const samplingSpan = root ?? batch.spans[0];
      const samplingId =
        samplingSpan === undefined
          ? batch.logs[0]?.logId.slice(4)
          : toOtlpTraceId(samplingSpan.traceId);
      if (
        samplingId === undefined ||
        !sampleInvocation(samplingId, otlp.samplingRate)
      ) {
        return Effect.succeed(null);
      }

      const reference: IBackendTrace | null =
        root === undefined
          ? null
          : {
              traceId: toOtlpTraceId(root.traceId),
              spanId: toOtlpSpanId(root.spanId),
            };
      return Effect.suspend(() =>
        exportTelemetryBatch({
          batch,
          resource: OtlpResource.make({
            serviceName:
              env.ZEROSPIN_SYSTEM_NAME ??
              configured?.system.name ??
              env.ZEROSPIN_SYSTEM_ID,
          }),
          tracesEndpoint: otlp.tracesEndpoint,
          logsEndpoint: otlp.logsEndpoint,
          headers: readDeliveryHeaders(otlp),
        }),
      ).pipe(
        Effect.catchCause(() =>
          Effect.logDebug('Application telemetry delivery unavailable'),
        ),
        Effect.as(reference),
      );
    }).pipe(Effect.catchCause(() => Effect.succeed(null)));
  },
});
