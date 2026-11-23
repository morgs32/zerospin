import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { RpcTarget } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';

import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { ServiceVersionChains } from '../repoServices/ServiceVersionChains.js';
import type { IWorkerRpcEncoder } from '../runWorkerInvocation/runWorkerInvocation.js';
import type { IEvaluatedServiceCommand } from '../ServiceVersionChain/evaluatedServiceCommand.js';
import type { ServiceVersionChain } from '../ServiceVersionChain/ServiceVersionChain.js';

import type { IServiceAgentProjectionKey } from './resolveServiceAgentView.js';
import { serviceAgentProjectionDbConfig } from './serviceAgentProjectionDbConfig.js';

const methodName = 'ServiceAgentProjection.evaluatedCommandsFanoutSubscriber';

/** Bind the source identity, actual durable cursor, and owner's receiving procedure. */
export function evaluatedCommandsFanoutSubscriber<E, R>(props: {
  db: IDb;
  key: IServiceAgentProjectionKey;
  sourceKey: Parameters<typeof ServiceVersionChain.getRepo>[0]['key'];
  RpcTarget: typeof RpcTarget;
  managedRuntime: ManagedRuntime.ManagedRuntime<NoInfer<R>, unknown>;
  encodeRpcOutcome: IWorkerRpcEncoder;
  receive: (
    delivery: IFanoutDelivery<IEvaluatedServiceCommand>,
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
      sourceKey.serviceName !== key.serviceName ||
      sourceKey.serviceVersion !== key.serviceVersion
    ) {
      return yield* makeZerospinError({
        code: 'fanout-source-key-mismatch',
        message: 'Service source does not match the bound service projection',
      });
    }
    const sourceRepos = yield* ServiceVersionChains;
    const common = {
      RpcTarget: RpcTargetClass,
      managedRuntime,
      encodeRpcOutcome,
      sourceKey,
      getCurrentIndex: () =>
        db
          .select()
          .from(serviceAgentProjectionDbConfig.schema.materializationHead)
          .where(
            eq(
              serviceAgentProjectionDbConfig.schema.materializationHead
                .singletonId,
              1,
            ),
          )
          .get()?.serviceIndex ?? 0,
      receive,
    };
    return makeFanoutSubscriber({
      ...common,
      name: 'agentVersionRepoFanout',
      key,
      getRepo: acquisition =>
        sourceRepos.getRepo(acquisition).pipe(
          Effect.map(repo => ({
            agentVersionRepoFanout: repo.agentVersionRepoFanout,
          })),
        ),
    });
  })();
}

Object.defineProperty(evaluatedCommandsFanoutSubscriber, 'name', {
  value: methodName,
});
