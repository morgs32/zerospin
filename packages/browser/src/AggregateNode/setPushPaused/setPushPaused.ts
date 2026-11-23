import type { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { nodeRpcErrorFor } from '../../Node/nodeRpcErrorFor.ts';
import type { AggregateNodeSynchronization } from '../AggregateNodeSynchronization.ts';
/** Persist the decoded pause flag, and start the existing background push when unpaused. */
export const setPushPaused = makeFn('AggregateBrowserSessionApi.setPushPaused')(
  function* (props: {
    pushPaused: boolean;
    node: Pick<AggregateNode, 'setPushPaused'>;
    synchronization: Pick<AggregateNodeSynchronization, 'push'>;
    check(): void;
  }) {
    const { pushPaused, node, synchronization, check } = props;
    yield* Effect.tryPromise({
      try: async () => {
        check();
        await node.setPushPaused(pushPaused);
        if (!pushPaused) {
          void synchronization.push().catch(() => undefined);
        }
      },
      catch: nodeRpcErrorFor([
        'node-signed-out',
        'node-tab-detached',
        'node-staging-blocked',
        'outbox-source-replaced',
      ]),
    });
  },
);
