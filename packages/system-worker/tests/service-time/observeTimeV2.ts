import { upgradeServiceContractRelease } from '@zerospin/core/contracts/make/upgradeServiceContractRelease';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';

import { observeTimeV1 as observeTime } from './observeTimeV1.ts';

export const evaluationTimes: { phase: string; millis: number }[] = [];

export const resetEvaluationTimes = () => {
  evaluationTimes.length = 0;
};

export const observeTimeV2 = upgradeServiceContractRelease(observeTime, {
  version: 2,
  up: () =>
    Effect.gen(function* () {
      evaluationTimes.push({
        phase: 'adapter',
        millis: yield* Clock.currentTimeMillis,
      });
      return {};
    }),
  guard: () =>
    Effect.gen(function* () {
      evaluationTimes.push({
        phase: 'guard',
        millis: yield* Clock.currentTimeMillis,
      });
    }),
  program: () =>
    Effect.gen(function* () {
      const millis = yield* Clock.currentTimeMillis;
      evaluationTimes.push({ phase: 'program', millis });
      return millis;
    }),
});
