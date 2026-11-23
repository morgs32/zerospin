import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { nodeRpcErrorFor } from '../../Node/nodeRpcErrorFor.ts';
import { sharedWorkerVersion } from '../../sharedWorkerVersion.ts';

/** Report this worker build only after its retained storage namespace is owned. */
export const ready = makeFn('StandaloneSharedWorkerApi.ready')(
  function* (props: { ownership: Promise<void>; isClosed(): boolean }) {
    const { ownership, isClosed } = props;
    return yield* Effect.tryPromise({
      try: async () => {
        if (isClosed()) throw makeZerospinError('node-tab-detached');
        await ownership;
        if (isClosed()) throw makeZerospinError('node-tab-detached');
        return {
          version: sharedWorkerVersion,
          artifactUrl: globalThis.location.href,
        };
      },
      catch: nodeRpcErrorFor(['node-tab-detached']),
    });
  },
);
