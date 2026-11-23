import type {
  IServiceAgentRelease,
  IServiceAgentSessionInputs,
} from '@zerospin/core/agent/types';
import type { ServiceAgentNode } from '@zerospin/core/ServiceAgentNode/ServiceAgentNode';
import { ServiceAgentSessionSnapshotSchema } from '@zerospin/core/serviceAgentSession/ServiceAgentSessionSnapshotSchema';
import {
  ServiceAgentSocketClientMessageSchema,
  ServiceAgentSocketServerMessageSchema,
} from '@zerospin/core/serviceAgentSession/ServiceAgentSocketProtocolSchema';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import { synchronizeAgentNode } from '../agentNodeBrowser/synchronizeAgentNode.ts';

/** Bind the observer transport to the owner's exact snapshot and command-delta codecs. */
export function synchronizeServiceAgentNode<
  RELEASE extends IServiceAgentRelease,
>(props: {
  node: ServiceAgentNode<RELEASE>;
  agentRelease: RELEASE;
  inputs: IServiceAgentSessionInputs;
  reportFailure: ISessionFailureReporter;
  signal: AbortSignal;
}) {
  const { node, agentRelease, inputs } = props;
  const clientMessage = Schema.decodeUnknownSync(
    Schema.toType(ServiceAgentSocketClientMessageSchema),
  );
  const serverMessage = Schema.decodeUnknownSync(
    Schema.fromJsonString(ServiceAgentSocketServerMessageSchema),
    { onExcessProperty: 'error' },
  );
  return synchronizeAgentNode({
    ...props,
    hasBaseline: () => node.store.getState().serviceIndex !== null,
    bootstrap: signal =>
      inputs.bootstrap({
        signal,
        nodeId: node.sessionId,
        serviceName: inputs.serviceName,
        serviceVersion: inputs.serviceVersion,
        agentName: agentRelease.agentName,
        agentVersion: agentRelease.agentVersion,
      }),
    installBootstrap: boot => {
      const snapshot = Schema.decodeUnknownSync(
        ServiceAgentSessionSnapshotSchema,
      )(boot.snapshot);
      node.validateBootstrap(snapshot);
      if (node.store.getState().serviceIndex === null) {
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
