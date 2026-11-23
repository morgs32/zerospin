import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { nodeRpcErrorFor } from '../../Node/nodeRpcErrorFor.ts';
import type { AggregateNodeSynchronization } from '../AggregateNodeSynchronization.ts';

/** Check this tab capability and execute the actual synchronization program. */
export const resume = makeFn('AggregateBrowserSessionApi.resume')(
  function* (props: {
    synchronization: Pick<AggregateNodeSynchronization, 'resumeProgram'>;
    check(): void;
  }) {
    const { synchronization, check } = props;
    yield* Effect.try({
      try: check,
      catch: nodeRpcErrorFor(['node-signed-out', 'node-tab-detached']),
    });
    return yield* synchronization.resumeProgram();
  },
);
