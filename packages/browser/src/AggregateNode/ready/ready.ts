import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { nodeRpcErrorFor } from '../../Node/nodeRpcErrorFor.ts';
/** Report SharedWorker executable readiness before identity-specific storage acquisition. */
export const ready = makeFn('AggregateSharedWorkerApi.ready')(
  function* (props: {
    disposed: boolean;
    ready(): Promise<{ version: string; artifactUrl: string }>;
  }) {
    const { disposed, ready } = props;
    return yield* Effect.tryPromise({
      try: async () => {
        if (disposed) {
          throw makeZerospinError('node-tab-detached');
        }
        return ready();
      },
      catch: nodeRpcErrorFor(['node-tab-detached']),
    });
  },
);
