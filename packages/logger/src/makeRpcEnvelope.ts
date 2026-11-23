import { type IErrorJson, type IZerospinErrorJson } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { captureTelemetry } from './captureTelemetry.ts';
import { encodeRpcExit } from './encodeRpcExit.ts';
import { type TelemetryCollector } from './TelemetryCollector.ts';
import type { IRpcEnvelope } from './types.ts';

/** Settle typed failures without catching defects or rejected transport promises. */
export function makeRpcEnvelope<A, E extends IZerospinErrorJson, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<
  IRpcEnvelope<
    A,
    [E] extends [never]
      ? never
      : IZerospinErrorJson<E['code'] | 'error-serialization-failed'>
  >,
  never,
  Exclude<R, TelemetryCollector>
>;
export function makeRpcEnvelope<A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<
  IRpcEnvelope<A, IErrorJson<E>>,
  never,
  Exclude<R, TelemetryCollector>
>;
export function makeRpcEnvelope<A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<
  IRpcEnvelope<A, IErrorJson<E>>,
  never,
  Exclude<R, TelemetryCollector>
> {
  return captureTelemetry(program).pipe(
    Effect.flatMap(({ exit, telemetry }) => encodeRpcExit(exit, telemetry)),
  );
}
