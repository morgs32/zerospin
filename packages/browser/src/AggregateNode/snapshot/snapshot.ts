import type { AggregateNode } from '@zerospin/core/AggregateNode/AggregateNode';
import { AggregateNodeCommandSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import { makeNodeSnapshotRequestSchema } from '@zerospin/core/Node/NodeSnapshotRequestSchema';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  nodeRpcErrorFor,
  snapshotFailureCodes,
} from '../../Node/nodeRpcErrorFor.ts';

/** Fence the attachment before reading the node's committed snapshot. */
export const snapshot = makeFn('AggregateBrowserSessionApi.snapshot')(
  function* (props: {
    input: unknown;
    node: Pick<AggregateNode, 'snapshot'>;
    check(): void;
  }) {
    const { input, node, check } = props;
    return yield* Effect.tryPromise({
      try: async () => {
        check();
        const request = Schema.decodeUnknownSync(
          makeNodeSnapshotRequestSchema(AggregateNodeCommandSchema),
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
