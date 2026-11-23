import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { ServiceChains } from '@zerospin/system-worker/repoServices/ServiceChains';
import { env } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import { readEvaluatedCommand } from '../readEvaluatedCommand.js';
import type { replayCommands } from '../replayCommands/replayCommands.js';
import type { replayCommandsFanoutSubscriber } from '../replayCommandsFanoutSubscriber/replayCommandsFanoutSubscriber.js';

type IReplaySubscriber = Effect.Success<
  ReturnType<
    typeof replayCommandsFanoutSubscriber<
      Effect.Error<ReturnType<typeof replayCommands>>,
      never
    >
  >
>;

/** Progress originals to one checkpoint, replay this version, and recover its exact result. */
export const awaitCommandResult = makeFn(
  'ServiceVersionRepo.awaitCommandResult',
)((
  props: Parameters<typeof readEvaluatedCommand>[0] & {
    replayThrough(index: number): ReturnType<IReplaySubscriber['catchup']>;
  },
) => {
  const { serviceIndex, key, replayThrough, db } = props;
  return Effect.gen(function* () {
    if (!Number.isSafeInteger(serviceIndex) || serviceIndex < 1) {
      return yield* makeZerospinError('service-result-index-invalid');
    }
    const issuer = env.ZEROSPIN_HOSTED_RELEASE_RPC;
    if (issuer !== undefined) {
      yield* Effect.promise(async () => {
        using rpc = await issuer.getReleaseRpc();
        return await rpc.executeCommandsThrough(serviceIndex);
      }).pipe(Effect.flatMap(readRpcEnvelope));
    } else {
      const sourceRepos = yield* ServiceChains;
      const chain = yield* sourceRepos.getRepo({ key });
      yield* Effect.promise(() =>
        chain.executeCommandsThrough(serviceIndex),
      ).pipe(Effect.flatMap(readRpcEnvelope));
    }
    yield* Effect.promise(() => replayThrough(serviceIndex)).pipe(
      Effect.flatMap(readRpcEnvelope),
    );
    return yield* readEvaluatedCommand({ db, key, serviceIndex });
  });
});
