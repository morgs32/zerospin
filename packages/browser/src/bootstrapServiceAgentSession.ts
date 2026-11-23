import type {
  IServiceAgentRelease,
  IServiceAgentSessionInputs,
} from '@zerospin/core/agent/types';
import type { ServiceAgentNode } from '@zerospin/core/ServiceAgentNode/ServiceAgentNode';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import * as Effect from 'effect/Effect';
import type { StoreApi } from 'zustand/vanilla';

import type { IAgentSessionHostState } from './agentNodeBrowser/makeAgentSessionHost.ts';
import { openServiceAgentNode } from './ServiceAgentNode/openServiceAgentNode.ts';
import { synchronizeServiceAgentNode } from './ServiceAgentNode/ServiceAgentNodeSynchronization.ts';

/** First replay completes initialization; current observation availability remains on the Node. */
export function bootstrapServiceAgentSession<
  RELEASE extends IServiceAgentRelease,
>(props: {
  agentRelease: RELEASE;
  store: StoreApi<IAgentSessionHostState<ServiceAgentNode<RELEASE>>>;
  inputs: IServiceAgentSessionInputs;
  execution: ISessionExecution<unknown>;
  reportFailure: ISessionFailureReporter;
  signal: AbortSignal;
}) {
  const { agentRelease, store, inputs, execution, reportFailure, signal } =
    props;
  return Effect.gen(function* () {
    const node = yield* openServiceAgentNode({
      agentRelease,
      inputs,
      execution,
      signal,
    });
    if (signal.aborted) return yield* Effect.interrupt;
    store.setState({ node });
    if (signal.aborted) return yield* Effect.interrupt;
    yield* synchronizeServiceAgentNode({
      agentRelease,
      inputs,
      reportFailure,
      signal,
      node,
    });
    if (
      signal.aborted ||
      store.getState().node !== node ||
      store.getState().status === 'failed'
    ) {
      return yield* Effect.interrupt;
    }
    store.setState({ status: 'ready' });
  });
}
