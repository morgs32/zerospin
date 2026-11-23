import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { AggregateChains } from '@zerospin/system-worker/repoServices/AggregateChains';
import * as Effect from 'effect/Effect';

import { readEvaluatedCommand } from '../readEvaluatedCommand/readEvaluatedCommand.js';
import type { replayCommand } from '../replayCommands/replayCommand.js';
import type { replayCommandsFanoutSubscriber } from '../replayCommandsFanoutSubscriber/replayCommandsFanoutSubscriber.js';

type IReplaySubscriber = Effect.Success<
  ReturnType<
    typeof replayCommandsFanoutSubscriber<
      Effect.Error<ReturnType<typeof replayCommand>>,
      never
    >
  >
>;

/** Progress originals, replay the finalized prefix, and recover the requested version's output. */
export const awaitCommandResult = makeFn(
  'AggregateVersionRepo.awaitCommandResult',
)((
  props: Parameters<typeof readEvaluatedCommand>[0] & {
    replayThrough(index: number): ReturnType<IReplaySubscriber['catchup']>;
  },
) => {
  const { aggregateIndex, db, key, replayThrough } = props;
  return Effect.gen(function* () {
    if (!Number.isSafeInteger(aggregateIndex) || aggregateIndex < 1) {
      return yield* makeZerospinError('aggregate-execution-index-invalid');
    }
    const sourceRepos = yield* AggregateChains;
    const chain = yield* sourceRepos.getRepo({ key });
    yield* Effect.promise(() =>
      chain.executeCommandsThrough(aggregateIndex),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    yield* Effect.promise(() => replayThrough(aggregateIndex)).pipe(
      Effect.flatMap(readRpcEnvelope),
    );
    return yield* readEvaluatedCommand({ db, key, aggregateIndex });
  });
});
