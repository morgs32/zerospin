import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import type { IServiceVersionRepo } from '@zerospin/system-worker/ServiceVersionRepo/types';
import * as Effect from 'effect/Effect';

/** Replay the captured finalized prefix through the local receiving procedure. */
export const catchupMaterialization = Effect.fn(
  'ServiceVersionRepo.catchupMaterialization',
)(function* (props: {
  repo: Pick<IServiceVersionRepo, 'replayCommandsFanoutSubscriber'>;
  key: { systemId: string; serviceName: string };
}) {
  const { repo, key } = props;
  yield* Effect.promise(() =>
    repo.replayCommandsFanoutSubscriber(key).catchup(),
  ).pipe(Effect.flatMap(readRpcEnvelope));
});
