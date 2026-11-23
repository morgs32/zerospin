import type { IErrorJson } from '@zerospin/error';
import {
  captureTelemetry,
  type IRpcEnvelope,
  type TelemetryCollector,
} from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { reportRpcTelemetry } from '../reportRpcTelemetry/reportRpcTelemetry.js';
import { reportWorkerFailure } from '../reportWorkerFailure/reportWorkerFailure.js';
import { WorkerTelemetryLive } from '../repoServices/WorkerTelemetryLive.js';
import { WorkerTelemetry } from '../WorkerTelemetry/WorkerTelemetry.js';

export type IWorkerInvocationRunner = <A, E, R>(
  program: Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, R>;

export type IWorkerRpcEncoder = <A, E, R>(
  program: Effect.Effect<A, E, R>,
) => Effect.Effect<IRpcEnvelope<A, IErrorJson<E>>, never, R>;

/** Own one source capture and its bounded export while preserving the complete Exit. */
export function runWorkerInvocation<A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, TelemetryCollector>> {
  return Effect.uninterruptibleMask(restore =>
    Effect.gen(function* () {
      const capture = yield* captureTelemetry(restore(program));
      yield* (yield* WorkerTelemetry)
        .emit({ batch: capture.ownTelemetry })
        .pipe(Effect.catchCause(() => Effect.void));
      return yield* Exit.isSuccess(capture.exit)
        ? Effect.succeed(capture.exit.value)
        : Effect.failCause(capture.exit.cause);
    }).pipe(
      // Observe cleanup failures before restoring pending interruption.
      Effect.tapCause(cause =>
        Effect.sync(() =>
          reportWorkerFailure({ boundary: 'runWorkerInvocation', cause }),
        ),
      ),
    ),
  ).pipe(Effect.provide(WorkerTelemetryLive));
}

/** Encode a DO/subscriber outcome after source-owned capture and diagnostic delivery. */
export function makeWorkerRpcEnvelope<A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<
  IRpcEnvelope<A, IErrorJson<E>>,
  never,
  Exclude<R, TelemetryCollector>
> {
  return Effect.uninterruptibleMask(restore =>
    Effect.gen(function* () {
      const capture = yield* captureTelemetry(restore(program));
      const { envelope } = yield* reportRpcTelemetry({
        capture,
        emit: (yield* WorkerTelemetry).emit,
      });
      return envelope;
    }).pipe(
      Effect.tapCause(cause =>
        Effect.sync(() =>
          reportWorkerFailure({ boundary: 'makeWorkerRpcEnvelope', cause }),
        ),
      ),
    ),
  ).pipe(Effect.provide(WorkerTelemetryLive));
}
