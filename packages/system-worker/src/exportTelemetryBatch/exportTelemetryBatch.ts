import type { ITelemetryBatch } from '@zerospin/logger';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as OtlpExporter from 'effect/observability/OtlpExporter';
import type * as OtlpResource from 'effect/observability/OtlpResource';
import * as OtlpSerialization from 'effect/observability/OtlpSerialization';

import { makeOtlpTelemetryBatch } from './makeOtlpTelemetryBatch.js';

const deliveryTimeout = Duration.seconds(5);

/** Scope closure joins or cancels every export fiber within the delivery bound. */
export const exportTelemetryBatch = (props: {
  batch: ITelemetryBatch;
  resource: OtlpResource.Resource;
  tracesEndpoint: string;
  logsEndpoint: string;
  headers: Readonly<Record<string, string>>;
}): Effect.Effect<void> => {
  const { batch, resource, tracesEndpoint, logsEndpoint, headers } = props;
  return Effect.suspend(() => {
    let deliveredTraces = batch.spans.length === 0;
    let deliveredLogs = batch.logs.length === 0;

    return Effect.gen(function* () {
      const payload = makeOtlpTelemetryBatch(batch, resource);
      const serialization = yield* OtlpSerialization.OtlpSerialization;
      const options = {
        headers,
        exportInterval: Duration.hours(1),
        maxBatchSize: 'disabled' as const,
        shutdownTimeout: deliveryTimeout,
      };

      if (!deliveredTraces) {
        const traces = yield* OtlpExporter.make({
          ...options,
          url: tracesEndpoint,
          label: 'ZerospinTraces',
          body: () => [
            serialization.traces(payload.traces),
            Effect.sync(() => {
              deliveredTraces = true;
            }),
          ],
        });
        traces.push(payload.traces);
      }
      if (!deliveredLogs) {
        const logs = yield* OtlpExporter.make({
          ...options,
          url: logsEndpoint,
          label: 'ZerospinLogs',
          body: () => [
            serialization.logs(payload.logs),
            Effect.sync(() => {
              deliveredLogs = true;
            }),
          ],
        });
        logs.push(payload.logs);
      }
      const flusher = yield* OtlpExporter.Flusher;
      yield* flusher.flush;
    }).pipe(
      // The standard exporter may log its HTTP Cause, including request headers.
      // Keep credentials out of those diagnostics and report only bounded outcome.
      Effect.provide(
        Layer.mergeAll(
          FetchHttpClient.layer,
          OtlpSerialization.layerJson,
          OtlpExporter.layerFlusher,
          Logger.layer([]),
        ),
      ),
      Effect.scoped,
      Effect.interruptible,
      Effect.timeoutOption(deliveryTimeout),
      Effect.asVoid,
      Effect.catchCause(() => Effect.void),
      Effect.andThen(
        Effect.suspend(() =>
          deliveredTraces && deliveredLogs
            ? Effect.void
            : Effect.logDebug(
                'Application telemetry delivery did not complete',
              ),
        ),
      ),
      Effect.catchCause(() => Effect.void),
    );
  });
};
