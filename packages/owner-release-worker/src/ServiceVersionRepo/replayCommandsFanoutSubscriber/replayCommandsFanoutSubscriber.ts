import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { IFanoutDelivery } from '@zerospin/system-worker/makeFanoutQueue/makeFanoutQueue';
import { makeFanoutSubscriber } from '@zerospin/system-worker/makeFanoutSubscriber/makeFanoutSubscriber';
import { ServiceChains } from '@zerospin/system-worker/repoServices/ServiceChains';
import type { IWorkerRpcEncoder } from '@zerospin/system-worker/runWorkerInvocation/runWorkerInvocation';
import { env, type RpcTarget } from 'cloudflare:workers';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';

import type { replayCommands } from '../replayCommands/replayCommands.js';

const methodName = 'ServiceVersionRepo.replayCommandsFanoutSubscriber';

/** Bind one shared-input source to this version's retained replay cursor and receiver. */
export function replayCommandsFanoutSubscriber<E, R>(props: {
  getCurrentIndex(): number;
  key: Parameters<typeof replayCommands>[0]['key'];
  sourceKey: Parameters<
    Context.Service.Shape<typeof ServiceChains>['getRepo']
  >[0]['key'];
  RpcTarget: typeof RpcTarget;
  managedRuntime: ManagedRuntime.ManagedRuntime<NoInfer<R>, unknown>;
  encodeRpcOutcome: IWorkerRpcEncoder;
  receive: (
    delivery: IFanoutDelivery<
      Parameters<typeof replayCommands>[0]['rows'][number]
    >,
    source: 'pull' | 'push',
  ) => Effect.Effect<void, E, R>;
}) {
  const {
    sourceKey,
    key,
    RpcTarget: RpcTargetClass,
    managedRuntime,
    encodeRpcOutcome,
    receive,
  } = props;

  return makeFn(methodName)(function* () {
    if (
      sourceKey.systemId !== key.systemId ||
      sourceKey.serviceName !== key.serviceName
    ) {
      return yield* makeZerospinError({
        code: 'service-fanout-source-invalid',
        message: 'Service fanout source must match the materializer owner',
      });
    }
    const sourceRepos = yield* ServiceChains;
    const issuer = env.ZEROSPIN_HOSTED_RELEASE_RPC;
    return makeFanoutSubscriber({
      RpcTarget: RpcTargetClass,
      managedRuntime,
      encodeRpcOutcome,
      name: 'replayCommandsFanout',
      sourceKey,
      key,
      getRepo: acquisition =>
        sourceRepos.getRepo(acquisition).pipe(
          Effect.map(repo => ({
            replayCommandsFanout: repo.replayCommandsFanout,
          })),
        ),
      ...(issuer === undefined
        ? {}
        : {
            openReplayPage: async () => {
              const rpc = await issuer.getReleaseRpc();
              return {
                getPage: ({ afterIndex, maxIndex }) =>
                  rpc.readReplayPage(afterIndex, maxIndex),
                [Symbol.dispose]: () => rpc[Symbol.dispose](),
              };
            },
          }),
      getCurrentIndex: props.getCurrentIndex,
      receive,
    });
  })();
}

Object.defineProperty(replayCommandsFanoutSubscriber, 'name', {
  value: methodName,
});
