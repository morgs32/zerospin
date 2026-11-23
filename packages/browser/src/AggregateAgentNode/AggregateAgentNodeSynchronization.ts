import { AggregateAgentSessionSnapshotSchema } from '@zerospin/core/agent/AggregateAgentSessionSnapshotSchema';
import type {
  IAggregateAgentRelease,
  IAggregateAgentSessionInputs,
} from '@zerospin/core/agent/types';
import type { AggregateAgentNode } from '@zerospin/core/AggregateAgentNode/AggregateAgentNode';
import {
  AggregateAgentSocketClientMessageSchema,
  AggregateAgentSocketServerMessageSchema,
} from '@zerospin/core/aggregateAgentSession/AggregateAgentSocketProtocolSchema';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import { synchronizeAgentNode } from '../agentNodeBrowser/synchronizeAgentNode.ts';

/** Bind the observer transport to the owner's exact snapshot and command-delta codecs. */
export function synchronizeAggregateAgentNode<
  RELEASE extends IAggregateAgentRelease,
>(props: {
  node: AggregateAgentNode<RELEASE>;
  agentRelease: RELEASE;
  inputs: IAggregateAgentSessionInputs;
  reportFailure: ISessionFailureReporter;
  signal: AbortSignal;
}) {
  const { node, agentRelease, inputs } = props;
  const clientMessage = Schema.decodeUnknownSync(
    Schema.toType(AggregateAgentSocketClientMessageSchema),
  );
  const serverMessage = Schema.decodeUnknownSync(
    Schema.fromJsonString(AggregateAgentSocketServerMessageSchema),
    { onExcessProperty: 'error' },
  );
  return synchronizeAgentNode({
    ...props,
    hasBaseline: () => node.store.getState().aggregateIndex !== null,
    bootstrap: signal =>
      inputs.bootstrap({
        signal,
        nodeId: node.sessionId,
        aggregateName: inputs.aggregateName,
        aggregateVersion: inputs.aggregateVersion,
        agentName: agentRelease.agentName,
        agentVersion: agentRelease.agentVersion,
        aggregateId: inputs.aggregateId,
      }),
    installBootstrap: boot => {
      const snapshot = Schema.decodeUnknownSync(
        AggregateAgentSessionSnapshotSchema,
      )(boot.snapshot);
      node.validateBootstrap(snapshot);
      if (node.store.getState().aggregateIndex === null) {
        node.installInitialSnapshot(snapshot);
      }
    },
    resumeMessage: () =>
      JSON.stringify(clientMessage({ type: 'resume', ...node.resume })),
    receive: data => {
      const message = serverMessage(data);
      if (message.type === 'commands') {
        node.applyPage(message.commands);
        return false;
      }
      if (message.type === 'replay-complete') {
        node.completeReplay(message);
        return true;
      }
      throw makeZerospinError({
        code: 'agent-node-state-required',
        extra: message,
      });
    },
    setConnection: connection => node.setConnection(connection),
  });
}
