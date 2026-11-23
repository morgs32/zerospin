import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';

/** Evaluate synchronous command decisions at the bound command time while keeping elapsed timing live. */
export const withCommandEvaluationClock = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  at: Date,
) =>
  Clock.clockWith(liveClock => {
    const millis = at.getTime();
    const nanos = BigInt(millis) * 1_000_000n;
    return Effect.provideService(program, Clock.Clock, {
      currentTimeMillisUnsafe: () => millis,
      currentTimeMillis: Effect.succeed(millis),
      currentTimeNanosUnsafe: () => nanos,
      currentTimeNanos: Effect.succeed(nanos),
      monotonicTimeNanosUnsafe: () => liveClock.monotonicTimeNanosUnsafe(),
      monotonicTimeNanos: liveClock.monotonicTimeNanos,
      sleep: duration => liveClock.sleep(duration),
    });
  });
