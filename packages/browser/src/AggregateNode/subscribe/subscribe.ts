import type {
  AggregateNode,
  IAggregateNodeState,
} from '@zerospin/core/AggregateNode/AggregateNode';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { makeFn } from '@zerospin/logger';
import type { RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';

import type { makeBrowserSessionSubscription } from '../../Node/makeBrowserSessionSubscription.ts';
import type { makeNodeCommandInterests } from '../../Node/makeNodeCommandInterests.ts';
import {
  nodeRpcErrorFor,
  snapshotFailureCodes,
} from '../../Node/nodeRpcErrorFor.ts';
import type { IAggregateViewRequest } from '../AggregateBrowserSessionApi.ts';
/** Replace the retained sink and gate Node deliveries by the live attachment. */
export const subscribe = makeFn('AggregateBrowserSessionApi.subscribe')(
  function* (props: {
    request: IAggregateViewRequest;
    interests: ReturnType<
      typeof makeNodeCommandInterests<IAggregateNodeCommand>
    >;
    sink: RpcStub<Required<Parameters<AggregateNode['subscribe']>[1]>>;
    node: Pick<AggregateNode, 'subscribe'>;
    subscription: ReturnType<typeof makeBrowserSessionSubscription>;
    check(): void;
    isCurrent(): boolean;
    isDetached(): boolean;
    onReset(): void;
    registerSignOutNotification(
      notify: (state: IAggregateNodeState) => Promise<void>,
    ): void;
  }) {
    const {
      request,
      interests,
      sink,
      node,
      subscription,
      check,
      isCurrent,
      isDetached,
      onReset,
      registerSignOutNotification,
    } = props;
    yield* Effect.tryPromise({
      try: async () => {
        check();
        interests.add(request.pendingCommands ?? []);
        let deliveryEpoch = 0;
        await subscription.subscribe(
          request,
          () => sink.dup(),
          (subscriptionRequest, retained, isActive) => {
            registerSignOutNotification(async state => {
              if (isActive() && !isDetached()) {
                await retained.state(state, deliveryEpoch);
              }
            });
            return node.subscribe(
              subscriptionRequest,
              {
                reset: async options => {
                  if (isActive() && isCurrent() && !isDetached()) {
                    deliveryEpoch += 1;
                    onReset();
                    if (options?.preservePending !== true) interests.clear();
                    await retained.reset(options);
                  }
                },
                view: async (snapshot, generation) => {
                  const epoch = deliveryEpoch;
                  if (isActive() && isCurrent() && !isDetached()) {
                    await retained.view(snapshot, generation);
                    if (
                      epoch === deliveryEpoch &&
                      isActive() &&
                      isCurrent() &&
                      !isDetached()
                    ) {
                      interests.acknowledge(snapshot.commandCoverage);
                    }
                  }
                },
                state: async (state, generation) => {
                  if (
                    isActive() &&
                    !isDetached() &&
                    (isCurrent() || state.authentication === 'signed-out')
                  ) {
                    await retained.state(state, generation);
                  }
                },
              },
              interests.read,
            );
          },
        );
      },
      catch: nodeRpcErrorFor([
        'node-signed-out',
        'node-tab-detached',
        ...snapshotFailureCodes,
      ]),
    });
  },
);
