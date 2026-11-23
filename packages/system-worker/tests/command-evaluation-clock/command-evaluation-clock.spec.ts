import { withCommandEvaluationClock } from '@zerospin/core/contracts/withCommandEvaluationClock';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import { describe, expect, it } from 'vitest';

describe('Command evaluation clock', () => {
  it('freezes only evaluation wall time and delegates monotonic timing and sleep', async () => {
    let wallTime = 90_000;
    let monotonicTime = 0n;
    let sleeps = 0;
    const liveClock: Clock.Clock = {
      currentTimeMillisUnsafe: () => wallTime,
      currentTimeMillis: Effect.sync(() => wallTime),
      currentTimeNanosUnsafe: () => BigInt(wallTime) * 1_000_000n,
      currentTimeNanos: Effect.sync(() => BigInt(wallTime) * 1_000_000n),
      monotonicTimeNanosUnsafe: () => ++monotonicTime,
      monotonicTimeNanos: Effect.sync(() => ++monotonicTime),
      sleep: () =>
        Effect.sync(() => {
          sleeps += 1;
          wallTime += 10;
        }),
    };
    const sample = Clock.clockWith(clock =>
      Effect.gen(function* () {
        return {
          millis: yield* Clock.currentTimeMillis,
          nanos: yield* Clock.currentTimeNanos,
          unsafeMillis: clock.currentTimeMillisUnsafe(),
          unsafeNanos: clock.currentTimeNanosUnsafe(),
          monotonic: yield* Clock.monotonicTimeNanos,
          unsafeMonotonic: clock.monotonicTimeNanosUnsafe(),
        };
      }),
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const frozen = yield* withCommandEvaluationClock(
          Effect.gen(function* () {
            const before = yield* sample;
            yield* Effect.sleep(1);
            return { before, after: yield* sample };
          }),
          new Date(1_000),
        );
        return { ...frozen, outside: yield* sample };
      }).pipe(Effect.provideService(Clock.Clock, liveClock)),
    );
    for (const reading of [result.before, result.after]) {
      expect(reading).toMatchObject({
        millis: 1_000,
        nanos: 1_000_000_000n,
        unsafeMillis: 1_000,
        unsafeNanos: 1_000_000_000n,
      });
    }
    expect(result.after.monotonic).toBeGreaterThan(result.before.monotonic);
    expect(result.after.unsafeMonotonic).toBeGreaterThan(
      result.before.unsafeMonotonic,
    );
    expect(result.outside).toMatchObject({
      millis: 90_010,
      nanos: 90_010_000_000n,
      unsafeMillis: 90_010,
      unsafeNanos: 90_010_000_000n,
    });
    expect(sleeps).toBe(1);
  });
});
