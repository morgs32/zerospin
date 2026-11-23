import { upgradeAggregateContractRelease } from '@zerospin/core/contracts/make/upgradeAggregateContractRelease';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';

import { observeTimeV1 as observeAggregateTime } from './observeTimeV1.ts';

export const aggregateEvaluationTimes: { phase: string; millis: number }[] = [];

export const resetEvaluationTimes = () => {
  aggregateEvaluationTimes.length = 0;
};

export const observeTimeV2 = upgradeAggregateContractRelease(
  observeAggregateTime,
  {
    version: 2,
    up: () =>
      Effect.gen(function* () {
        aggregateEvaluationTimes.push({
          phase: 'adapter',
          millis: yield* Clock.currentTimeMillis,
        });
        return {};
      }),
    guard: () =>
      Effect.gen(function* () {
        aggregateEvaluationTimes.push({
          phase: 'guard',
          millis: yield* Clock.currentTimeMillis,
        });
      }),
    program: () =>
      Effect.gen(function* () {
        const millis = yield* Clock.currentTimeMillis;
        aggregateEvaluationTimes.push({ phase: 'program', millis });
        return millis;
      }),
  },
);
