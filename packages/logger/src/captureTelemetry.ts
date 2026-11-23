import * as Effect from 'effect/Effect';
import type * as Exit from 'effect/Exit';

import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import {
  makeTelemetryCollector,
  type TelemetryCollector,
} from './TelemetryCollector.ts';
import type { ITelemetryBatch } from './types.ts';

export type ITelemetryCapture<A, E> = Readonly<{
  exit: Exit.Exit<A, E>;
  telemetry: ITelemetryBatch;
  ownTelemetry: ITelemetryBatch;
}>;

/** Capture once, including complete failure Causes and imported local history. */
export const captureTelemetry = <A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<
  ITelemetryCapture<A, E>,
  never,
  Exclude<R, TelemetryCollector>
> =>
  Effect.suspend(() => {
    const collector = makeTelemetryCollector();
    return Effect.uninterruptibleMask(restore =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(restore(program));
        const ownTelemetry = collector.flushOwn();
        const telemetry = collector.flush();
        return { exit, telemetry, ownTelemetry };
      }),
    ).pipe(Effect.provide(makeTelemetryLayer(collector)));
  });
