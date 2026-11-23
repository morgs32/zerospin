import type {
  IAggregateAgentRelease,
  IAggregateAgentSessionInputs,
} from '@zerospin/core/agent/types';
import type { AggregateAgentNode } from '@zerospin/core/AggregateAgentNode/AggregateAgentNode';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import * as Effect from 'effect/Effect';
import type { StoreApi } from 'zustand/vanilla';

import type { IAgentSessionHostState } from './agentNodeBrowser/makeAgentSessionHost.ts';
import { synchronizeAggregateAgentNode } from './AggregateAgentNode/AggregateAgentNodeSynchronization.ts';
import { openAggregateAgentNode } from './AggregateAgentNode/openAggregateAgentNode.ts';

/** First replay completes initialization; current observation availability remains on the Node. */
export function bootstrapAggregateAgentSession<
  RELEASE extends IAggregateAgentRelease,
>(props: {
  agentRelease: RELEASE;
  store: StoreApi<IAgentSessionHostState<AggregateAgentNode<RELEASE>>>;
  inputs: IAggregateAgentSessionInputs;
  execution: ISessionExecution<unknown>;
  reportFailure: ISessionFailureReporter;
  signal: AbortSignal;
}) {
  const { agentRelease, store, inputs, execution, reportFailure, signal } =
    props;
  return Effect.gen(function* () {
    const node = yield* openAggregateAgentNode({
      agentRelease,
      inputs,
      execution,
      signal,
    });
    if (signal.aborted) return yield* Effect.interrupt;
    store.setState({ node });
    if (signal.aborted) return yield* Effect.interrupt;
    yield* synchronizeAggregateAgentNode({
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
