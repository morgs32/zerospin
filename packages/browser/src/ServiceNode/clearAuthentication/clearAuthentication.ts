import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { nodeRpcErrorFor } from '../../Node/nodeRpcErrorFor.ts';
/** Revoke the live attachment through the retained worker's authentication cleanup. */
export const clearAuthentication = makeFn(
  'ServiceBrowserSessionApi.clearAuthentication',
)(function* (props: { check(): void; clear(): Promise<void> }) {
  const { check, clear } = props;
  yield* Effect.tryPromise({
    try: async () => {
      check();
      await clear();
    },
    catch: nodeRpcErrorFor([
      'node-signed-out',
      'node-tab-detached',
      'node-discovery-blocked',
      'node-discovery-incomplete',
      'node-definition-session-mismatch',
    ]),
  });
});
