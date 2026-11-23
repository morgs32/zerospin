import { AgentOriginSchema } from '@zerospin/core/contracts/OriginSchema';
import { ServiceAgentSessionLockSchema } from '@zerospin/core/serviceAgentSession/ServiceAgentSessionLockSchema';
import type { IServiceSocketServerMessage } from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import type { Connection } from 'partyserver';

import { validateServiceAgentSessionLock } from '../serviceAgent/validateServiceAgentSessionLock.js';
import {
  resolveServiceAgentView,
  type IServiceAgentProjectionKey,
} from '../serviceAgentProjection/resolveServiceAgentView.js';

import {
  ServiceAgentConnectionStateSchema,
  type IServiceAgentConnectionState,
} from './connectionState.js';

/** Fence the attachment before attempting sends or closure on every disposal path. */
export function disposeConnection(props: {
  connection: Pick<Connection, 'setState' | 'send' | 'close'>;
  code?: number;
  reason?: string;
  message?: IServiceSocketServerMessage;
}) {
  const { connection, message, code, reason } = props;

  try {
    connection.setState(null);
  } finally {
    try {
      if (message !== undefined) {
        connection.send(JSON.stringify(message));
      }
    } finally {
      if (code !== undefined) {
        connection.close(code, reason);
      }
    }
  }
}

/** Restore exact immutable Agent capabilities from the bound hibernation attachment. */
export const readConnectionCapabilities = Effect.fn(
  'ServiceAgentVersionChain.readConnectionCapabilities',
)(function* (props: {
  key: IServiceAgentProjectionKey;
  connection: Connection<IServiceAgentConnectionState>;
}) {
  const { key, connection } = props;
  const decoded = yield* Schema.decodeUnknownEffect(
    ServiceAgentConnectionStateSchema,
  )(connection.state, { onExcessProperty: 'error' }).pipe(Effect.result);
  if (Result.isFailure(decoded)) {
    return null;
  }
  const state = decoded.success;
  const { agent } = yield* resolveServiceAgentView(key);
  if (
    state.serviceName !== key.serviceName ||
    state.serviceVersion !== key.serviceVersion ||
    state.agentName !== key.agentName ||
    state.agentVersion !== key.agentVersion ||
    state.sessionName !== agent.sessionName ||
    (state.phase !== 'awaiting-resume' && state.nodeId !== state.issuedNodeId)
  ) {
    return null;
  }
  return {
    state,
    models: agent.db.models,
  };
});

/** Admit only the complete trusted lock, exact Agent origin and issued observer Node identity. */
export const onConnect = Effect.fn('ServiceAgentVersionChain.onConnect')(
  function* (props: {
    key: IServiceAgentProjectionKey;
    connection: Connection<IServiceAgentConnectionState>;
    request: Request;
  }) {
    const { key, connection, request } = props;
    const serviceName = request.headers.get('x-zerospin-service-name');
    const serviceVersionHeader = request.headers.get(
      'x-zerospin-service-version',
    );
    if (
      serviceName !== key.serviceName ||
      serviceVersionHeader !== String(key.serviceVersion)
    ) {
      return yield* makeZerospinError('service-agent-session-identity-invalid');
    }
    const origin = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AgentOriginSchema),
    )(request.headers.get('x-zerospin-origin'), { onExcessProperty: 'error' });
    const lock = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceAgentSessionLockSchema),
    )(request.headers.get('x-zerospin-service-agent-session-lock'), {
      onExcessProperty: 'error',
    });
    const issuedNodeId = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.NonEmptyString),
    )(request.headers.get('x-zerospin-producer'), {
      onExcessProperty: 'error',
    });
    if (
      origin.agentName !== key.agentName ||
      origin.agentVersion !== key.agentVersion
    ) {
      return yield* makeZerospinError('service-agent-session-identity-invalid');
    }
    yield* validateServiceAgentSessionLock({
      serviceName,
      serviceVersion: key.serviceVersion,
      agentName: key.agentName,
      agentVersion: key.agentVersion,
      sessionName: lock.sessionName,
      serviceAgentSessionLock: lock,
    });
    connection.setState({
      phase: 'awaiting-resume',
      issuedNodeId,
      serviceName,
      serviceVersion: key.serviceVersion,
      agentName: key.agentName,
      agentVersion: key.agentVersion,
      sessionName: lock.sessionName,
    });
  },
);
