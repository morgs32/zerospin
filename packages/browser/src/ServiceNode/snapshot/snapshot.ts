import { makeNodeSnapshotRequestSchema } from '@zerospin/core/Node/NodeSnapshotRequestSchema';
import type { ServiceNode } from '@zerospin/core/ServiceNode/ServiceNode';
import { ServiceNodeCommandSchema } from '@zerospin/core/ServiceNode/ServiceNodeCommandSchema';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  nodeRpcErrorFor,
  snapshotFailureCodes,
} from '../../Node/nodeRpcErrorFor.ts';

/** Fence the attachment before reading the node's committed snapshot. */
export const snapshot = makeFn('ServiceBrowserSessionApi.snapshot')(
  function* (props: {
    input: unknown;
    node: Pick<ServiceNode, 'snapshot'>;
    check(): void;
  }) {
    const { input, node, check } = props;
    return yield* Effect.tryPromise({
      try: async () => {
        check();
        const request = Schema.decodeUnknownSync(
          makeNodeSnapshotRequestSchema(ServiceNodeCommandSchema),
        )(input, { onExcessProperty: 'error' });
        return node.snapshot(request);
      },
      catch: nodeRpcErrorFor([
        'node-signed-out',
        'node-tab-detached',
        ...snapshotFailureCodes,
      ]),
    });
  },
);
