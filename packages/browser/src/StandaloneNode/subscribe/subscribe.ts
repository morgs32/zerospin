import type { IAggregateNodeSink } from '@zerospin/core/AggregateNode/AggregateNode';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';

import type { makeBrowserSessionSubscription } from '../../Node/makeBrowserSessionSubscription.ts';
import type { makeNodeCommandInterests } from '../../Node/makeNodeCommandInterests.ts';
import {
  nodeRpcErrorFor,
  snapshotFailureCodes,
} from '../../Node/nodeRpcErrorFor.ts';
import type {
  IStandaloneSessionAttachment,
  IStandaloneViewRequest,
} from '../StandaloneBrowserSessionApi.ts';
/** Replace the retained sink after checking its bound Node, and send retained attachment claims. */
export const subscribe = makeFn('StandaloneBrowserSessionApi.subscribe')(
  function* (props: {
    request: IStandaloneViewRequest;
    interests: ReturnType<
      typeof makeNodeCommandInterests<IAggregateNodeCommand>
    >;
    sink: RpcStub<Required<IAggregateNodeSink>>;
    attachment: IStandaloneSessionAttachment;
    subscription: ReturnType<typeof makeBrowserSessionSubscription>;
    check(): void;
    assertCurrent(): Promise<unknown>;
    isClosed(): boolean;
  }) {
    const {
      request,
      interests,
      sink,
      attachment,
      subscription,
      check,
      assertCurrent,
      isClosed,
    } = props;
    yield* Effect.tryPromise({
      try: async () => {
        check();
        interests.add(request.pendingCommands ?? []);
        await subscription.subscribe(
          request,
          () => sink.dup(),
          async (subscriptionRequest, retained, isActive) => {
            await assertCurrent();
            if (!isActive()) {
              return () => {};
            }
            return attachment.node.subscribe(
              subscriptionRequest,
              {
                reset: async options => {
                  if (!isActive() || isClosed()) return;
                  if (options?.preservePending !== true) interests.clear();
                  await retained.reset(options);
                },
                view: async snapshot => {
                  if (isActive() && !isClosed()) {
                    if (snapshot.metadata.nodeId !== attachment.boundNodeId) {
                      throw makeZerospinError('standalone-capability-stale');
                    }
                    await retained.view({
                      ...snapshot,
                      identity: {
                        ...snapshot.identity,
                        claims: attachment.claims,
                      },
                    });
                    interests.acknowledge(snapshot.commandCoverage);
                  }
                },
                state: async state => {
                  if (isActive() && !isClosed()) {
                    if (state.nodeId !== attachment.boundNodeId) {
                      throw makeZerospinError('standalone-capability-stale');
                    }
                    await retained.state(state);
                  }
                },
              },
              interests.read,
            );
          },
        );
      },
      catch: nodeRpcErrorFor([
        'node-tab-detached',
        'standalone-capability-stale',
        ...snapshotFailureCodes,
      ]),
    });
  },
);
