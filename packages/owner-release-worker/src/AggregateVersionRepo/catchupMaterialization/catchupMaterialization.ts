import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeFn } from '@zerospin/logger';
import type { IAggregateVersionRepo } from '@zerospin/system-worker/AggregateVersionRepo/types';
import * as Effect from 'effect/Effect';

/** Commit one captured finalized prefix through the existing paginated replay subscriber. */
export const catchupMaterialization = makeFn(
  'AggregateVersionRepo.catchupMaterialization',
)(function* (props: {
  repo: Pick<IAggregateVersionRepo, 'replayCommandsFanoutSubscriber'>;
  key: { systemId: string; aggregateId: string; aggregateName: string };
}) {
  const { key, repo } = props;
  yield* Effect.promise(() =>
    repo.replayCommandsFanoutSubscriber(key).catchup(),
  ).pipe(Effect.flatMap(readRpcEnvelope));
});
