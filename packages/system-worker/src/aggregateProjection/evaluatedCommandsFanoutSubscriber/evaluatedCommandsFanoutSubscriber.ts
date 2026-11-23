import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { RpcTarget } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';

import type { AggregateVersionChain } from '../../AggregateVersionChain/AggregateVersionChain.js';
import type { IEvaluatedAggregateCommand } from '../../AggregateVersionChain/evaluatedAggregateCommand.js';
import type { IFanoutDelivery } from '../../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { AggregateVersionChains } from '../../repoServices/AggregateVersionChains.js';
import type { IWorkerRpcEncoder } from '../../runWorkerInvocation/runWorkerInvocation.js';
import { aggregateProjectionDbConfig } from '../aggregateProjectionDbConfig.js';
import type { IAggregateProjectionKey } from '../resolveAggregateProjectionView.js';

const methodName = 'AggregateProjection.evaluatedCommandsFanoutSubscriber';

/** Bind the source identity, actual durable cursor, and owner's receiving procedure. */
export function evaluatedCommandsFanoutSubscriber<E, R>(props: {
  db: IDb;
  key: IAggregateProjectionKey;
  sourceKey: Parameters<typeof AggregateVersionChain.getRepo>[0]['key'];
  RpcTarget: typeof RpcTarget;
  managedRuntime: ManagedRuntime.ManagedRuntime<NoInfer<R>, unknown>;
  encodeRpcOutcome: IWorkerRpcEncoder;
  receive: (
    delivery: IFanoutDelivery<IEvaluatedAggregateCommand>,
  ) => Effect.Effect<void, E, R>;
}) {
  const {
    sourceKey,
    key,
    db,
    RpcTarget: RpcTargetClass,
    managedRuntime,
    encodeRpcOutcome,
    receive,
  } = props;

  return makeFn(methodName)(function* () {
    if (
      sourceKey.systemId !== key.systemId ||
      sourceKey.aggregateId !== key.aggregateId ||
      sourceKey.aggregateName !== key.aggregateName ||
      sourceKey.aggregateVersion !== key.aggregateVersion
    ) {
      return yield* makeZerospinError({
        code: 'fanout-source-key-mismatch',
        message:
          'Aggregate source does not match the bound aggregate projection',
      });
    }
    const sourceRepos = yield* AggregateVersionChains;
    const common = {
      RpcTarget: RpcTargetClass,
      managedRuntime,
      encodeRpcOutcome,
      sourceKey,
      getCurrentIndex: () =>
        db
          .select()
          .from(aggregateProjectionDbConfig.schema.materializationHead)
          .where(
            eq(
              aggregateProjectionDbConfig.schema.materializationHead
                .singletonId,
              1,
            ),
          )
          .get()?.aggregateIndex ?? 0,
      receive,
    };
    return 'actorName' in key
      ? makeFanoutSubscriber({
          ...common,
          name: 'actorVersionChainFanout',
          key,
          getRepo: acquisition =>
            sourceRepos.getRepo(acquisition).pipe(
              Effect.map(repo => ({
                actorVersionChainFanout: repo.actorVersionChainFanout,
              })),
            ),
        })
      : makeFanoutSubscriber({
          ...common,
          name: 'agentVersionChainFanout',
          key,
          getRepo: acquisition =>
            sourceRepos.getRepo(acquisition).pipe(
              Effect.map(repo => ({
                agentVersionChainFanout: repo.agentVersionChainFanout,
              })),
            ),
        });
  })();
}

Object.defineProperty(evaluatedCommandsFanoutSubscriber, 'name', {
  value: methodName,
});
