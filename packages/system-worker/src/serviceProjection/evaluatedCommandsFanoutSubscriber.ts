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

import type { IServiceProjectionKey } from './resolveServiceActorView.js';
import { serviceProjectionDbConfig } from './serviceProjectionDbConfig.js';

const methodName = 'ServiceProjection.evaluatedCommandsFanoutSubscriber';

/** Bind the source identity, actual durable cursor, and owner's receiving procedure. */
export function evaluatedCommandsFanoutSubscriber<E, R>(props: {
  db: IDb;
  key: IServiceProjectionKey;
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
          .from(serviceProjectionDbConfig.schema.materializationHead)
          .where(
            eq(
              serviceProjectionDbConfig.schema.materializationHead.singletonId,
              1,
            ),
          )
          .get()?.serviceIndex ?? 0,
      receive,
    };
    return makeFanoutSubscriber({
      ...common,
      name: 'actorVersionRepoFanout',
      key,
      getRepo: acquisition =>
        sourceRepos.getRepo(acquisition).pipe(
          Effect.map(repo => ({
            actorVersionRepoFanout: repo.actorVersionRepoFanout,
          })),
        ),
    });
  })();
}

Object.defineProperty(evaluatedCommandsFanoutSubscriber, 'name', {
  value: methodName,
});
