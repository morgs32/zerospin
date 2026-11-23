import * as DateTime from 'effect/DateTime';
import * as Effect from 'effect/Effect';

export const dutils = {
  date: Effect.fn('dutils.date')(function* () {
    const date = yield* DateTime.now;
    return DateTime.toDateUtc(date);
  }),
  hash: Effect.fn('dutils.hash')(function* () {
    const date = yield* DateTime.now;
    return date.epochMilliseconds.toString(36);
  }),
};
