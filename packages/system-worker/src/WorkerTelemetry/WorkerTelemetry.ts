import type { IBackendTrace } from '@zerospin/error';
import type { ISpanRecord, ITelemetryBatch } from '@zerospin/logger';
import * as Context from 'effect/Context';
import type * as Effect from 'effect/Effect';

/** Optional diagnostics owned by the Worker invocation that produced them. */
export class WorkerTelemetry extends Context.Service<
  WorkerTelemetry,
  {
    readonly emit: (props: {
      batch: ITelemetryBatch;
      root?: ISpanRecord | null;
    }) => Effect.Effect<IBackendTrace | null>;
  }
>()('WorkerTelemetry') {}
