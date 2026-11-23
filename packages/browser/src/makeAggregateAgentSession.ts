import type {
  IAggregateAgentRelease,
  IAggregateAgentSession,
  IAggregateAgentSessionInputs,
} from '@zerospin/core/agent/types';
import type { AggregateAgentNode } from '@zerospin/core/AggregateAgentNode/AggregateAgentNode';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import type { Layer } from 'effect';

import { makeAgentSessionHost } from './agentNodeBrowser/makeAgentSessionHost.ts';
import { bootstrapAggregateAgentSession } from './bootstrapAggregateAgentSession.ts';
import { applicationLayer } from './browserSession/applicationLayer.ts';

/** Construct a cold observer; initialize acquires its single transient selected view. */
export function makeAggregateAgentSession<
  const RELEASE extends IAggregateAgentRelease,
  APP_LAYER extends Layer.Layer<never, IAnyError, never> = Layer.Layer<
    never,
    never
  >,
>(
  props: {
    agentRelease: RELEASE;
    layer?: APP_LAYER;
  } & IAggregateAgentSessionInputs,
) {
  const {
    agentRelease,
    layer,
    aggregateName,
    aggregateVersion,
    aggregateId,
    bootstrap,
    sqliteModuleFactory,
  } = props;
  const inputs: IAggregateAgentSessionInputs = {
    aggregateName,
    aggregateVersion,
    aggregateId,
    bootstrap,
    ...(sqliteModuleFactory === undefined ? {} : { sqliteModuleFactory }),
  };
  if (inputs.aggregateId.length === 0) {
    throw makeZerospinError('agent-session-inputs-invalid');
  }
  const host = makeAgentSessionHost<AggregateAgentNode<RELEASE>>({
    layer: applicationLayer(layer),
    bootstrap: context =>
      bootstrapAggregateAgentSession({
        ...context,
        agentRelease,
        inputs,
      }),
  });
  const session: IAggregateAgentSession<
    RELEASE,
    Layer.Success<APP_LAYER>
  > = Object.assign(host, { agentRelease });
  return Object.freeze(session);
}
