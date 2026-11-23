import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { IFanoutDelivery } from '@zerospin/system-worker/makeFanoutQueue/makeFanoutQueue';
import { makeFanoutSubscriber } from '@zerospin/system-worker/makeFanoutSubscriber/makeFanoutSubscriber';
import { AggregateChains } from '@zerospin/system-worker/repoServices/AggregateChains';
import type { IWorkerRpcEncoder } from '@zerospin/system-worker/runWorkerInvocation/runWorkerInvocation';
import type { RpcTarget } from 'cloudflare:workers';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';

import type { replayCommand } from '../replayCommands/replayCommand.js';

const methodName = 'AggregateVersionRepo.replayCommandsFanoutSubscriber';

/** Bind one shared-input source to this version's retained replay cursor and receiver. */
export function replayCommandsFanoutSubscriber<E, R>(props: {
  getCurrentIndex(): number;
  key: Parameters<typeof replayCommand>[0]['key'];
  sourceKey: Parameters<
    Context.Service.Shape<typeof AggregateChains>['getRepo']
  >[0]['key'];
  RpcTarget: typeof RpcTarget;
  managedRuntime: ManagedRuntime.ManagedRuntime<NoInfer<R>, unknown>;
  encodeRpcOutcome: IWorkerRpcEncoder;
  receive: (
    delivery: IFanoutDelivery<Parameters<typeof replayCommand>[0]['command']>,
    source: 'pull' | 'push',
  ) => Effect.Effect<void, E, R>;
}) {
  const {
    sourceKey,
    key,
    getCurrentIndex,
    RpcTarget: RpcTargetClass,
    managedRuntime,
    encodeRpcOutcome,
    receive,
  } = props;

  return makeFn(methodName)(function* () {
    if (
      sourceKey.systemId !== key.systemId ||
      sourceKey.aggregateId !== key.aggregateId ||
      sourceKey.aggregateName !== key.aggregateName
    ) {
      return yield* makeZerospinError({
        code: 'aggregate-fanout-source-invalid',
        message: 'Aggregate fanout source must match the materializer owner',
      });
    }
    const sourceRepos = yield* AggregateChains;
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
      getCurrentIndex,
      receive,
    });
  })();
}

Object.defineProperty(replayCommandsFanoutSubscriber, 'name', {
  value: methodName,
});
