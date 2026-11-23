import type { ServiceNode } from '@zerospin/core/ServiceNode/ServiceNode';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { nodeRpcErrorFor } from '../../Node/nodeRpcErrorFor.ts';
import type { ServiceNodeSynchronization } from '../ServiceNodeSynchronization.ts';
/** Persist the decoded pause flag, and start the existing background push when unpaused. */
export const setPushPaused = makeFn('ServiceBrowserSessionApi.setPushPaused')(
  function* (props: {
    pushPaused: boolean;
    node: Pick<ServiceNode, 'setPushPaused'>;
    synchronization: Pick<ServiceNodeSynchronization, 'push'>;
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
